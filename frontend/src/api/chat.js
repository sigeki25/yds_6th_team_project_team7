// AI 코스 도우미 API. 백엔드가 준비되기 전에는 USE_MOCK 으로 화면에서 흉내 냄 (AI 호출 없음).
//
// ── 프론트가 기대하는 형식 (백엔드와 협의용) ─────────────────────────
// POST /api/chat
//   요청 { messages: [{ role:"user"|"assistant", text }],  // 이번 대화 전체 (저장 안 함)
//          region: "chungcheong" | null,                   // 지금 고른 권역 (없으면 대화로 판단)
//          festivalId: "123" | null,                       // 첨부한 축제 (D110 '이 축제로 코스 만들기')
//          previousCourse: Course | null }                 // 코스 수정(R110)일 때만, 수정은 1회
//   응답 200 — type 으로 구분
//     { type:"ask", text, quickReplies?: ["반나절","하루"] }   // 조건이 부족해 되묻기
//     { type:"course", text, course: Course, fallback?: true }  // fallback: AI 실패로 가까운 순 기본 코스
//     { type:"refuse", text }                                    // 서비스와 무관한 질문
//   응답 429 → 하루 사용 한도 초과 (입력창 막음, 지도 · 목록은 그대로)
//
// Course = { title, duration:"half"|"day", baseDate:"2026-10-21", baseDateDefault: true,
//            region, totalKm, moveMin, totalMin, estimated,      // estimated: 추정 구간이 하나라도 있음
//            places: [{ id, type:"festival"|"attraction"|"food", title, address, image, lat, lng,
//                       stayMin, hours: "09:00~18:00" | null, reason, festivalId? }],
//            legs: [{ minutes, km, estimated }],                 // places[i] → places[i+1] 자동차 이동
//            nearby: [{ id, type, title, lat, lng }],            // 코스에 안 들어간 주변 장소 (회색 점)
//            changed?: [placeId], changeNote?: "..." }           // 수정 응답일 때 바뀐 장소 · 한 줄 설명
//   - 반나절 240분 · 하루 480분 (체류 포함) 안의 코스만
//   - hours 는 TourAPI 원본 값만, 없으면 null
// ────────────────────────────────────────────────────────────────

import { distanceKm, festivalStatus, REGION_BY_SIDO, today } from "../lib/festival.js";
import { fetchRegions, loadMockFestivals, loadMockPlaces } from "./festivals.js";

export const USE_MOCK = true;
export const CHAT_MAX_LENGTH = 200;

export class ChatLimitError extends Error {}

export async function postChat(body) {
  if (USE_MOCK) return mockChat(body);
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new ChatLimitError();
  if (!res.ok) throw new Error(`${res.status} /api/chat`);
  return res.json();
}

// ── mock ─────────────────────────────────────────────────────────
const STAY = { festival: 90, attraction: 60, food: 60 };
const LIMIT = { half: 240, day: 480 };
const DAILY_LIMIT = 20; // 새로고침하면 다시 셈
let usedToday = 0;

const ASK_DURATION = "얼마나 다녀오실 예정인가요?";
const ASK_AREA = "어느 지역으로 가실 건가요? 시 · 군 이름으로 말씀해 주세요.";
const ASK_DATE = "언제 가실 건가요? 축제 기간 안의 날짜로 골라 주세요.";

async function mockChat({ messages, region, festivalId, previousCourse }) {
  await delay(1600);
  if (++usedToday > DAILY_LIMIT) throw new ChatLimitError();

  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const last = userTexts.at(-1) ?? "";
  const all = userTexts.join(" ");
  const asked = (q) => messages.some((m) => m.role === "assistant" && m.text.startsWith(q));

  const [festivals, places, sidoList] = await Promise.all([loadMockFestivals(), loadMockPlaces(), fetchRegions()]);
  if (previousCourse) return reviseCourse(previousCourse, last, places);

  const festival = festivalId ? festivals.find((f) => f.id === festivalId) : null;
  const city = findCity(all, sidoList);
  // 서비스와 무관한 질문: 되묻기에 답하는 중이 아니고, 마지막 말에 여행 관련 내용이 없을 때
  const prev = messages.at(-2);
  const answering = prev?.role === "assistant" && [ASK_DURATION, ASK_AREA, ASK_DATE].some((q) => prev.text.startsWith(q));
  const travelish = /코스|여행|축제|맛집|관광|구경|산책|바다|나들이|데이트|놀러|가고|갈래|가 ?볼|반나절|하루|먹|걷/.test(last)
    || findCity(last, sidoList) || (festival && userTexts.length === 1);
  if (!answering && !travelish) {
    return { type: "refuse", text: "여행 코스 만들기만 도와드릴 수 있어요. 가고 싶은 지역을 말씀해 주세요." };
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
    lat: p.lat, lng: p.lng, stayMin: STAY[p.type], hours: p.hours ?? null,
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
