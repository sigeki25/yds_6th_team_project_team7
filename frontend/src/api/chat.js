// AI 코스 도우미 API. 백엔드가 준비되기 전에는 USE_MOCK 으로 화면에서 흉내 냄 (AI 호출 없음).
//
// ── 백엔드와 맞춘 형식 (llm.py handle_chat 인자 · 반환값 그대로) ───────────
// POST /api/chat
//   요청 { message: "이번에 보낸 말",
//          history: [{ role:"user"|"assistant", content }],   // 이전 대화 (저장 안 함)
//          region: "chungcheong" | null,          // 추가 제안: 지도에서 고른 권역 (있으면 지역을 안 되물어도 됨)
//          festival_id: "123" | null,             // 추가 제안: D110 에서 첨부한 축제
//          previous_course: Course | null }       // 추가 제안: R110 코스 수정(1회)일 때 이전 코스
//   응답 200 { answer, quick_replies: ["반나절","하루"], conditions,   // handle_chat 반환값 그대로
//              course?: Course, fallback?: true }                     // 조건이 다 모이면 handle_chat 이 course 를 붙임 (fallback 은 추가 제안)
//     - conditions 가 null → AI 오류 안내 (CM10-8)
//     - conditions.off_topic → 서비스와 무관한 질문 (CM10-10)
//     - course 가 있으면 코스 완성 (CM10-7). fallback: AI 실패로 가까운 순 기본 코스
//   응답 429 → 하루 사용 한도 초과 (CM10-9, 추가 제안)
//
// Course = { title, duration:"half"|"day", baseDate:"2026-10-21", baseDateDefault: true,
//            region, totalKm, moveMin, totalMin, estimated,      // estimated: 추정 구간이 하나라도 있음
//            (region 은 지역 이름 "강릉". 화면은 이름으로 찾은 권역 코드를 regionCode 로 붙여 씀)
//            places: [{ id, type:"festival"|"attraction"|"food", title, address, image, lat, lng,
//                       stayMin, hours: "09:00~18:00" | null, restDate: "매주 월요일" | null, reason, festivalId? }],
//            legs: [{ minutes, km, estimated }],                 // places[i] → places[i+1] 자동차 이동
//            nearby: [{ id, type, title, lat, lng }],            // 코스에 안 들어간 주변 장소 (회색 점)
//            changed?: [placeId], changeNote?: "..." }           // 수정 응답일 때 바뀐 장소 · 한 줄 설명
//   - 반나절 240분 · 하루 480분 (체류 포함) 안의 코스만
//   - hours · restDate 는 TourAPI detailIntro2 글 그대로 (<br> 만 줄바꿈으로, 숫자로 바꾸지 않음), 없으면 null
//     detailIntro2 는 contentId 하나씩만 받아서 코스에 넣은 places 만 부름 (nearby · 후보는 안 부름 → 코스 장소 수만큼만)
//     hours    = 축제(15) playtime / 관광지(12) usetime / 음식점(39) opentimefood
//     restDate = 관광지 restdate / 음식점 restdatefood / 축제 null
//   - legs 는 kakao_api.get_route() 의 legs 를 바꿔 씀: minutes = round(duration / 60), km = distance / 1000 (소수 1자리)
//     길찾기 실패 구간만 직선거리로 어림하고 estimated: true
// ────────────────────────────────────────────────────────────────

import { distanceKm, festivalStatus, REGION_BY_SIDO, SIDO_SHORT, today } from "../lib/festival.js";
import { regionByCode } from "../lib/regions.js";
import { fetchRegions, loadMockFestivals, loadMockPlaces } from "./festivals.js";

export const USE_MOCK = true;
export const CHAT_MAX_LENGTH = 200;

export class ChatLimitError extends Error {}

/**
 * 채팅 한 번 주고받기
 * @param {{messages: {role, text}[], region, festivalId, previousCourse}} req  messages 의 마지막이 이번에 보낸 말
 * @returns {{type: "ask"|"text"|"course"|"refuse"|"error", text, quickReplies?, course?, fallback?}}
 */
export async function postChat({ messages, region, festivalId, previousCourse }) {
  const body = {
    message: messages.at(-1).text,
    history: messages.slice(0, -1).map(({ role, text }) => ({ role, content: text })),
    region: region ?? null,
    festival_id: festivalId ?? null,
    previous_course: previousCourse ?? null,
  };
  if (USE_MOCK) return withRegionCode(toReply(await mockChat(body)));
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new ChatLimitError();
  if (!res.ok) throw new Error(`${res.status} /api/chat`);
  return withRegionCode(toReply(await res.json()));
}

/** Course.region(지역 이름) → 지도 · 링크에 쓸 권역 코드 (못 찾으면 null) */
async function withRegionCode(reply) {
  const { course } = reply;
  if (!course) return reply;
  let regionCode = regionByCode(course.region)?.code ?? null; // mock 은 권역 코드를 줌
  if (!regionCode && course.region) {
    const sidoList = await fetchRegions().catch(() => []);
    const name = course.region;
    // 시·도 이름("광주", "충남") → 시·군·구 이름("강릉") 순서로 찾음
    const sido = sidoList.find((s) => s.name.includes(name) || SIDO_SHORT[s.name] === name)?.code
      ?? findCity(name, sidoList)?.sido;
    regionCode = REGION_BY_SIDO[sido] ?? null;
  }
  return { ...reply, course: { ...course, regionCode } };
}

/** handle_chat 반환값 → 화면에서 쓰는 형태 */
function toReply({ answer, quick_replies: quickReplies, conditions, course, fallback }) {
  if (course) return { type: "course", text: answer, course, fallback };
  if (conditions === null) return { type: "error", text: answer };
  if (conditions?.off_topic) return { type: "refuse", text: answer };
  if (quickReplies?.length) return { type: "ask", text: answer, quickReplies };
  return { type: "text", text: answer };
}

// ── mock ─────────────────────────────────────────────────────────
const STAY = { festival: 90, attraction: 60, food: 60 };
const LIMIT = { half: 240, day: 480 };
const DAILY_LIMIT = 20; // 새로고침하면 다시 셈
let usedToday = 0;

// llm.py 와 같은 문구
const ASK_DURATION = "반나절과 하루 중 얼마나 다녀오실 예정인가요?";
const ASK_AREA = "어느 지역으로 가고 싶으세요?";
const ASK_DATE = "언제 가실 건가요? 축제 기간 안의 날짜로 골라 주세요.";
const OFF_TOPIC = "여행 코스 만들기만 도와드릴 수 있어요. 가고 싶은 지역을 말씀해 주세요.";

/** 백엔드 응답 모양으로 돌려줌 ({ answer, quick_replies, conditions, course? }) */
async function mockChat({ message, history, region, festival_id: festivalId, previous_course: previousCourse }) {
  await delay(1600);
  if (++usedToday > DAILY_LIMIT) throw new ChatLimitError();
  const messages = [...history.map((h) => ({ role: h.role, text: h.content })), { role: "user", text: message }];
  const r = await mockReply(messages, region, festivalId, previousCourse);
  const conditions = { off_topic: r.type === "refuse" && r.text === OFF_TOPIC, region: null, duration: r.course?.duration ?? null,
    companion: null, preference: null, date: null };
  return { answer: r.text, quick_replies: r.quickReplies ?? [], conditions, ...(r.course ? { course: r.course } : {}) };
}

async function mockReply(messages, region, festivalId, previousCourse) {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const last = userTexts.at(-1) ?? "";
  const all = userTexts.join(" ");
  const asked = (q) => messages.some((m) => m.role === "assistant" && m.text.includes(q));

  const [festivals, places, sidoList] = await Promise.all([loadMockFestivals(), loadMockPlaces(), fetchRegions()]);
  if (previousCourse) return reviseCourse(previousCourse, last, places);

  const festival = festivalId ? festivals.find((f) => f.id === festivalId) : null;
  const city = findCity(all, sidoList);
  // 서비스와 무관한 질문: 되묻기에 답하는 중이 아니고, 마지막 말에 여행 관련 내용이 없을 때
  const prev = messages.at(-2);
  const answering = prev?.role === "assistant" && [ASK_DURATION, ASK_AREA, ASK_DATE].some((q) => prev.text.includes(q));
  const travelish = /코스|여행|축제|맛집|관광|구경|산책|바다|나들이|데이트|놀러|가고|갈래|가 ?볼|반나절|하루|먹|걷/.test(last)
    || findCity(last, sidoList) || (festival && userTexts.length === 1);
  if (!answering && !travelish) {
    return { type: "refuse", text: OFF_TOPIC };
  }
  if (!festival && !city && !region) {
    if (!asked(ASK_AREA)) return { type: "ask", text: ASK_AREA };
    return { type: "refuse", text: "지역을 찾지 못했어요. 지도에서 권역을 고르거나 시 · 군 이름으로 말씀해 주세요." };
  }

  let duration = /반나절|오전|오후|잠깐|두세 시간|3시간/.test(all) ? "half" : /하루|종일|당일|1일/.test(all) ? "day" : null;
  if (!duration) {
    if (!asked(ASK_DURATION)) return { type: "ask", text: ASK_DURATION, quickReplies: ["반나절", "하루"] };
    duration = "half";
  }

  // 예정 축제는 방문 날짜를 축제 기간 안에서 물음
  let baseDate = today();
  let baseDateDefault = true;
  if (festival && festivalStatus(festival) === "upcoming") {
    if (/첫날/.test(last) || /첫날/.test(all)) baseDate = festival.startDate;
    else if (/마지막 날/.test(all)) baseDate = festival.endDate;
    else if (!asked(ASK_DATE)) {
      return { type: "ask", text: `${ASK_DATE} (${festival.startDate} ~ ${festival.endDate})`, quickReplies: ["축제 첫날", "축제 마지막 날"] };
    } else baseDate = festival.startDate;
    baseDateDefault = false;
  }

  // 출발점: 첨부 축제 → 말한 시 · 군의 축제 → 권역에서 열리는 축제 → 관광지
  const open = (f) => f.lat != null && festivalStatus(f, baseDate) === "ongoing";
  let anchor = festival;
  if (!anchor && city) anchor = festivals.find((f) => open(f) && f.sidoCode === city.sido && f.sigunguCode === city.code);
  if (!anchor && !city && region) anchor = festivals.find((f) => open(f) && REGION_BY_SIDO[f.sidoCode] === region);
  const areaRegion = anchor ? REGION_BY_SIDO[anchor.sidoCode] : city ? REGION_BY_SIDO[city.sido] : region;
  const pool = places.filter((p) => p.region === areaRegion);
  const start = anchor ? { ...anchor, type: "festival" }
    : pool.find((p) => p.type === "attraction" && (!city || (p.sidoCode === city.sido && p.sigunguCode === city.code)))
      ?? pool.find((p) => p.type === "attraction");
  if (!start) return { type: "refuse", text: "이 지역에는 코스로 묶을 장소가 아직 없어요. 다른 지역을 말씀해 주세요." };

  const order = duration === "half" ? ["food", "attraction"] : ["attraction", "food", "attraction", "food"];
  const chosen = [start];
  for (const type of order) {
    const prev = chosen.at(-1);
    const next = nearest(pool, prev, type, chosen);
    if (!next) continue;
    if (courseMinutes([...chosen, next]) > LIMIT[duration]) break;
    chosen.push(next);
  }

  const name = city?.name.replace(/(특별자치)?[시군구]$/, "") ?? anchor?.sigungu?.replace(/[시군구]$/, "") ?? "";
  const who = /부모님/.test(all) ? "부모님과 " : /아이|아기/.test(all) ? "아이와 " : /친구/.test(all) ? "친구와 "
    : /연인|데이트/.test(all) ? "연인과 " : "";
  const style = /걷기|편하/.test(all) ? "걷기 편한 " : /맛집/.test(all) ? "맛집 위주 " : "";
  const course = buildCourse(chosen, {
    title: `${who}${style}${name} ${duration === "half" ? "반나절" : "하루"}`.replace(/\s+/g, " ").trim(),
    duration, baseDate, baseDateDefault, region: areaRegion, pool,
  });
  const dayText = duration === "half" ? "반나절" : "하루";
  const dateText = baseDateDefault ? " (방문일: 오늘 기준)" : ` (방문일: ${baseDate})`;
  return { type: "course", text: `${name} ${dayText} 코스를 골랐어요${dateText}. 지도에 번호로 표시했습니다.`, course };
}

function reviseCourse(prev, text, places) {
  const pool = places.filter((p) => p.region === prev.region);
  const list = prev.places.map((p) => ({ ...p }));
  const limit = LIMIT[prev.duration];
  let changed = [];
  let note;
  const wantType = /점심|저녁|식사|맛집|음식|먹|카페/.test(text) ? "food" : /관광|구경|볼거리|산책|명소/.test(text) ? "attraction" : null;

  if (/빼|줄여|줄이|짧게/.test(text) && list.length > 1) {
    const removed = list.pop();
    note = `${removed.title}을(를) 뺐어요.`;
  } else if (wantType) {
    const extra = nearest(pool, list.at(-1), wantType, list);
    if (extra && courseMinutes([...list, extra]) <= limit) {
      list.push(extra);
      changed = [extra.id];
      note = `${extra.title}을(를) 마지막에 넣었어요.`;
    } else if (extra && list.length > 1) {
      const out = list.pop();
      const swap = nearest(pool, list.at(-1), wantType, [...list, out]);
      list.push(swap);
      changed = [swap.id];
      note = `시간 안에 맞추려고 ${out.title} 대신 ${swap.title}을(를) 넣었어요.`;
    }
  } else if (list.length > 1) {
    const out = list.pop();
    const swap = nearest(pool, list.at(-1), out.type, [...list, out]);
    if (swap) {
      list.push(swap);
      changed = [swap.id];
      note = `${out.title} 대신 가까운 ${swap.title}(으)로 바꿨어요.`;
    } else list.push(out);
  }
  if (!note) return { type: "course", text: "요청대로 바꿀 장소를 찾지 못해 코스를 그대로 두었어요.", course: prev };

  const course = { ...buildCourse(list, { ...prev, pool }), changed, changeNote: note };
  return { type: "course", text: `코스를 고쳤어요. ${note}`, course };
}

function buildCourse(chosen, { title, duration, baseDate, baseDateDefault, region, pool }) {
  const legs = chosen.slice(1).map((p, i) => leg(chosen[i], p));
  const placesOut = chosen.map((p, i) => ({
    id: p.id, type: p.type, title: p.title, address: p.address ?? null, image: p.image ?? null,
    lat: p.lat, lng: p.lng, stayMin: STAY[p.type], hours: p.hours ?? null, restDate: p.restDate ?? null,
    reason: p.reason && !p.changed ? p.reason : reasonOf(p, i, chosen, legs, baseDate),
    ...(p.type === "festival" ? { festivalId: p.festivalId ?? p.id } : {}),
  }));
  const ids = new Set(chosen.map((p) => p.id));
  const center = chosen[0];
  const nearby = pool.filter((p) => !ids.has(p.id) && distanceKm(center, p) < 8).slice(0, 30)
    .map(({ id, type, title, lat, lng }) => ({ id, type, title, lat, lng }));
  const km = legs.reduce((s, l) => s + l.km, 0);
  const moveMin = legs.reduce((s, l) => s + l.minutes, 0);
  return {
    title, duration, baseDate, baseDateDefault, region,
    totalKm: Math.round(km * 10) / 10, moveMin,
    totalMin: moveMin + placesOut.reduce((s, p) => s + p.stayMin, 0),
    estimated: legs.some((l) => l.estimated),
    places: placesOut, legs, nearby,
  };
}

function reasonOf(p, i, chosen, legs, baseDate) {
  if (p.type === "festival") {
    return festivalStatus(p) === "ongoing" && baseDate === today() ? "지금 열리고 있는 축제예요" : "방문일에 열리는 축제예요";
  }
  if (i === 0) return "이 지역에서 많이 찾는 곳이에요";
  return `${chosen[i - 1].title}에서 차로 ${legs[i - 1].minutes}분`;
}

/** 직선거리로 자동차 이동을 어림함. 실제 백엔드는 길찾기 API, 실패 구간만 추정 */
function leg(a, b) {
  const straight = distanceKm(a, b);
  const km = Math.round(straight * 1.35 * 10) / 10;
  return { km, minutes: Math.max(3, Math.round((km / 35) * 60)), estimated: straight > 12 };
}

function courseMinutes(list) {
  return list.reduce((s, p, i) => s + STAY[p.type] + (i ? leg(list[i - 1], p).minutes : 0), 0);
}

function nearest(pool, from, type, exclude) {
  const used = new Set(exclude.map((p) => p.id));
  let best = null;
  let bestD = 25; // 25km 안에서만
  for (const p of pool) {
    if (p.type !== type || used.has(p.id)) continue;
    const d = distanceKm(from, p);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

/** 대화에서 시 · 군 · 구 이름 찾기 (마지막에 말한 곳 우선) */
function findCity(text, sidoList) {
  let found = null;
  let at = -1;
  for (const s of sidoList) {
    for (const g of s.sigungu) {
      const base = g.name.replace(/(특별자치)?[시군구]$/, "");
      if (base.length < 2) continue;
      const i = text.lastIndexOf(base);
      if (i > at) { at = i; found = { sido: s.code, code: g.code, name: g.name }; }
    }
  }
  return found;
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
