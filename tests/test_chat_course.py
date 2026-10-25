"""Offline regression tests: no model or external API requests."""
import json
import unittest
from datetime import date
from unittest.mock import patch
from types import SimpleNamespace

from pydantic import ValidationError
import llm
import course
from chat_api import ChatRequest, chat


def conditions(**kwargs):
    return {**llm.EMPTY_CONDITIONS, 'region': '강릉', 'duration': 'half', **kwargs}


def place(id, kind='attraction', lat=37.75):
    return dict(id=id, type=kind, title='장소' + id, lat=lat, lng=128.9,
                address=None, image=None, category=None)


class ChatTests(unittest.TestCase):
    def test_extractor_model_has_bounded_output_without_thinking(self):
        model = llm.get_llm(temperature=0)
        self.assertIs(model.reasoning, False)
        self.assertEqual(model.num_predict, 1024)

    def test_contract_forwards_context(self):
        payload = ChatRequest(message='맛집 추가', region='gangwon', festival_id='123',
                              previous_course={'region': '강릉', 'duration': 'half',
                                               'baseDate': '2026-10-25', 'places': [place('1')]})
        with patch('chat_api.handle_chat', return_value={'answer': 'ok'}) as handler:
            chat(payload)
        self.assertEqual(handler.call_args.kwargs['previous_course']['baseDate'], '2026-10-25')
        self.assertEqual(handler.call_args.kwargs['festival_id'], '123')

    def test_bounded_request(self):
        for data in ({'message': '  '}, {'message': 'x', 'history': [{'role': 'user', 'content': 'x'}] * 41},
                     {'message': 'x', 'festival_id': '../../etc'}):
            with self.assertRaises(ValidationError):
                ChatRequest(**data)
        with self.assertRaises(ValidationError):
            ChatRequest(message='x', previous_course={'region': '서울', 'duration': 'day',
                        'baseDate': '2026-10-25', 'places': [place('1', lat=float('nan'))]})

    def test_failure_does_not_generate_fake_course(self):
        with patch('llm.extract_conditions', return_value=None), patch('llm.build_course') as builder:
            result = llm.handle_chat('하루 여행')
        self.assertIsNone(result['conditions'])
        builder.assert_not_called()

    def test_broad_region_requires_city(self):
        with patch('llm.extract_conditions', return_value=conditions(region=None)), patch('llm.build_course') as builder:
            result = llm.handle_chat('반나절', region='chungcheong')
        self.assertIn('시·군', result['answer'])
        builder.assert_not_called()

    def test_attached_festival_requires_date_within_period(self):
        festival = {**place('1', 'festival'), 'startDate': '2099-01-01', 'endDate': '2099-01-02'}
        with patch('llm.extract_conditions', return_value=conditions()), \
             patch('llm.get_festival_detail', return_value=festival), patch('llm.build_course') as builder:
            result = llm.handle_chat('이 축제로 가자', festival_id='1')
        self.assertIn('2099-01-01', result['answer'])
        builder.assert_not_called()

    def test_attached_festival_becomes_anchor(self):
        festival = {**place('1', 'festival'), 'sigungu': '강릉시',
                    'startDate': '2099-01-01', 'endDate': '2099-01-02'}
        with patch('llm.extract_conditions', return_value=conditions(date='2099-01-01')), \
             patch('llm.get_festival_detail', return_value=festival), \
             patch('llm.build_course', return_value=(None, 'no_places')) as builder:
            llm.handle_chat('1월 1일', festival_id='1')
        self.assertEqual(builder.call_args.args[0]['festival']['id'], '1')
        self.assertEqual(builder.call_args.args[0]['region'], '강릉시')

    def test_extract_validates_untrusted_model_shape(self):
        output = {'region': ['강릉'], 'off_topic': 'false', 'revision': {'action': 'delete_everything'},
                  'duration': 'week', 'date': 'invalid'}
        with patch('llm.extract_chain') as chain:
            chain.invoke.return_value = SimpleNamespace(content=json.dumps(output))
            result = llm.extract_conditions('가자')
        self.assertFalse(result['off_topic'])
        self.assertEqual(result['region'], '강릉')
        self.assertIsNone(result['revision'])
        self.assertIsNone(result['date'])

    def test_unsupported_structured_output_retries_same_model_text_mode(self):
        from ollama import ResponseError
        with patch('llm.extract_chain') as structured, patch('llm.extract_text_chain') as plain:
            structured.invoke.side_effect = ResponseError('structured output is unavailable', status_code=501)
            plain.invoke.return_value = SimpleNamespace(content='```json\n{"region":"강릉","duration":"day"}\n```')
            result = llm.extract_conditions('강릉 하루')
        structured.invoke.assert_called_once()
        plain.invoke.assert_called_once()
        self.assertEqual(result['region'], '강릉')
        self.assertEqual(result['duration'], 'day')

    def test_unrelated_server_error_never_changes_output_mode(self):
        from ollama import ResponseError
        with patch('llm.extract_chain') as structured, patch('llm.extract_text_chain') as plain:
            structured.invoke.side_effect = ResponseError('model unavailable', status_code=500)
            self.assertIsNone(llm.extract_conditions('강릉 하루'))
        plain.invoke.assert_not_called()

    def test_prose_around_json_is_not_accepted(self):
        with patch('llm.extract_chain') as structured:
            structured.invoke.return_value = SimpleNamespace(content='설명 {"region":"강릉"}')
            self.assertIsNone(llm.extract_conditions('강릉 하루'))

    def test_revision_inherits_previous_date_and_region(self):
        previous = {'region': '강릉', 'duration': 'day', 'baseDate': '2099-01-01', 'places': [place('1')]}
        with patch('llm.extract_conditions', return_value=conditions(region=None, duration=None,
                     revision={'action': 'remove', 'target_id': None, 'place_type': None})), \
             patch('llm.revise_course', return_value=(None, 'cannot')) as revise:
            llm.handle_chat('짧게 해줘', previous_course=previous)
        self.assertEqual(revise.call_args.args[1]['date'], '2099-01-01')
        self.assertEqual(revise.call_args.args[1]['duration'], 'day')

    def test_new_region_ignores_stale_attachment_and_rebuilds(self):
        previous = {'region': '강릉', 'duration': 'day', 'baseDate': '2099-01-01',
                    'places': [place('1', 'festival')]}
        with patch('llm.extract_conditions', return_value=conditions(region='전주',
                    revision={'action': 'replace', 'target_id': '1'})), \
             patch('llm.get_festival_detail') as detail, patch('llm.revise_course') as revise, \
             patch('llm.build_course', return_value=(None, 'no_places')) as build:
            llm.handle_chat('전주로 바꾸자', festival_id='1', previous_course=previous)
        detail.assert_not_called()
        revise.assert_not_called()
        self.assertEqual(build.call_args.args[0]['region'], '전주')

    def test_changed_date_rechecks_retained_festival(self):
        previous = {'region': '강릉', 'duration': 'half', 'baseDate': '2099-01-01',
                    'places': [place('1', 'festival')]}
        festival = {**place('1', 'festival'), 'startDate': '2099-01-01', 'endDate': '2099-01-02'}
        with patch('llm.extract_conditions', return_value=conditions(date='2099-02-01',
                    revision={'action': 'add', 'place_type': 'food'})), \
             patch('llm.get_festival_detail', return_value=festival), \
             patch('llm.revise_course') as revise, patch('llm.build_course') as build:
            result = llm.handle_chat('2월 1일로 바꿔줘', previous_course=previous)
        revise.assert_not_called()
        build.assert_not_called()
        self.assertIn('축제 기간', result['answer'])

    def test_removing_festival_ignores_stale_attachment(self):
        previous = {'region': '강릉', 'duration': 'half', 'baseDate': '2099-01-01',
                    'places': [place('1', 'festival'), place('2')]}
        with patch('llm.extract_conditions', return_value=conditions(
                    revision={'action': 'remove', 'target_id': '1'})), \
             patch('llm.get_festival_detail') as detail, \
             patch('llm.revise_course', return_value=(None, 'ok')) as revise:
            llm.handle_chat('축제 빼줘', festival_id='1', previous_course=previous)
        detail.assert_not_called()
        revise.assert_called_once()


class CourseTests(unittest.TestCase):
    def test_nearby_replacement_excludes_old_stop_from_gap_but_not_id_check(self):
        old = place('1')
        candidate = place('2', lat=37.752)
        self.assertIsNone(course.nearest([old, candidate], old, 'attraction', [old]))
        self.assertEqual(course.nearest([old, candidate], old, 'attraction', [old], replacing_id='1')['id'], '2')

    def test_explicit_today_is_not_default_date(self):
        self.assertEqual(course.visit_date_of({'date': date.today().isoformat()}), (date.today().isoformat(), False))

    @patch('course.get_intro', return_value={'hours': '10~18', 'restDate': '월요일'})
    def test_hours_and_closure_for_festival(self, intro):
        self.assertEqual(course.place_intro(place('1', 'festival'))['restDate'], '월요일')
        intro.assert_called_once_with('1', 15)

    @patch('course.place_intro', return_value={'hours': None, 'restDate': None})
    @patch('course.route_legs', return_value=None)
    def test_targeted_removal_recomputes_totals(self, *_):
        previous = {'places': [place('1'), place('2', 'food'), place('3', lat=37.78)]}
        result, note = course.revise_course(previous, conditions(revision={'action': 'remove', 'target_id': '2'}))
        self.assertEqual([p['id'] for p in result['places']], ['1', '3'])
        self.assertEqual(result['totalMin'], 120 + sum(l['minutes'] for l in result['legs']))
        self.assertTrue(result['estimated'])
        self.assertIn('장소2', note)
        self.assertEqual(len(previous['places']), 3)

    @patch('course.place_intro', return_value={'hours': None, 'restDate': None})
    @patch('course.route_legs', return_value=None)
    @patch('course.nearby_places', return_value=[place('3', 'food', lat=37.76)])
    def test_addition_fetches_real_candidates(self, *_):
        result, _ = course.revise_course({'places': [place('1')]},
                    conditions(revision={'action': 'add', 'place_type': 'food'}))
        self.assertEqual([p['id'] for p in result['places']], ['1', '3'])
        self.assertEqual(result['changed'], ['3'])

    @patch('course.place_intro', return_value={'hours': None, 'restDate': None})
    @patch('course.route_legs', return_value=[{'minutes': 200, 'km': 5, 'estimated': False}])
    @patch('course.nearby_places', return_value=[place('3', 'food', lat=37.76)])
    def test_over_budget_addition_preserves_previous(self, *_):
        result, note = course.revise_course({'places': [place('1')]},
                    conditions(revision={'action': 'add', 'place_type': 'food'}))
        self.assertIsNone(result)
        self.assertIn('여행 시간을 넘어요', note)


if __name__ == '__main__':
    unittest.main()
