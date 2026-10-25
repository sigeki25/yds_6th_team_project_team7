"""HTTP regressions with upstream services mocked (no credentials/network required)."""
import importlib
import re
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from chroma import FilterSearchFestivalData, convert_FilterSearchFestival_to_original
from tour_api import TourApiError


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)

    def test_search_festival_needs_no_keyword_and_normalizes_dates(self):
        with patch("main.search_festival", return_value={"items": []}) as search:
            response = self.client.get("/api/searchFestival?start_date=2026-10-25&page=2&size=3")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(search.call_args.kwargs["start_date"], "20261025")
        self.assertEqual(search.call_args.kwargs["page"], 2)
        self.assertNotIn("keyword", search.call_args.kwargs)

    def test_invalid_filters_are_422(self):
        for query in ("startDate=nope", "startDate=20260230", "page=0", "size=-1",
                      "lng=126", "lat=95&lng=126", "radius=100", "radius=-1&lng=126&lat=37",
                      "startDate=20261101&endDate=20261001"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get("/api/festivals?" + query).status_code, 422)
        for path in ("searchFestival?start_date=20260230", "areaBasedList?page=-1",
                     "locationBasedList?lng=126&lat=37&radius=0", "searchKeyword?keyword=%20"):
            self.assertEqual(self.client.get("/api/" + path).status_code, 422)

    def test_location_passes_typed_values(self):
        with patch("main.location_based_list", return_value={"items": []}) as search:
            response = self.client.get("/api/locationBasedList?lng=126.5&lat=37.2&radius=1200&page=2")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(search.call_args.kwargs["lng"], 126.5)
        self.assertEqual(search.call_args.kwargs["radius"], 1200)
        self.assertEqual(search.call_args.kwargs["page"], 2)

    def test_upstream_failure_does_not_leak_credentials(self):
        with patch("main.search_keyword", side_effect=TourApiError("serviceKey=secret")):
            response = self.client.get("/api/searchKeyword?keyword=festival")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("secret", response.text)

    def test_missing_festival_is_404(self):
        with patch("main.get_festival_detail", return_value=None):
            self.assertEqual(self.client.get("/api/festivals/missing").status_code, 404)

    def test_sort_aliases(self):
        for alias, expected in {"distance": "dist", "startDate": "eventstartdate", "endDate": "eventenddate", "C": "modifiedtime"}.items():
            self.assertEqual(convert_FilterSearchFestival_to_original(FilterSearchFestivalData(arrange=alias))["arrange"], expected)

    def test_created_and_modified_sorts_put_newest_first(self):
        records = {
            "ids": ["1", "2", "3"],
            "documents": ["old", "new", "middle"],
            "metadatas": [
                {"modifiedtime": 20260101000000, "createdtime": 20260301000000},
                {"modifiedtime": 20260301000000, "createdtime": 20260201000000},
                {"modifiedtime": 20260201000000, "createdtime": 20260101000000},
            ],
        }
        with patch("chroma.collection_festival.get", return_value=records):
            for arrange, expected in (("C", ["2", "3", "1"]), ("D", ["1", "2", "3"])):
                with self.subTest(arrange=arrange):
                    response = self.client.get("/api/festivals", params={"arrange": arrange})
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual([item["id"] for item in response.json()["items"]], expected)

    def test_chat_route_is_registered(self):
        self.assertEqual(self.client.post("/api/chat", json={}).status_code, 422)

    def test_built_home_assets_are_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200, "Build frontend first: npm --prefix frontend run build")
        assets = re.findall(r'(?:src|href)="(/view/assets/[^\"]+)"', response.text)
        self.assertTrue(assets)
        for asset in assets:
            self.assertEqual(self.client.get(asset).status_code, 200)

    def test_seed_import_has_no_write_side_effect(self):
        with patch("chroma.collection_festival.upsert") as upsert:
            import chroma_insert_data
            importlib.reload(chroma_insert_data)
            upsert.assert_not_called()

    def test_seed_uses_upsert(self):
        import chroma_insert_data
        with patch("chroma_insert_data.collection_festival.upsert") as upsert:
            chroma_insert_data.insert_data()
        self.assertEqual(sum(len(call.kwargs["ids"]) for call in upsert.call_args_list), 296)


if __name__ == "__main__":
    unittest.main()
