import { useCallback, useMemo, useRef, useState } from "react";
import { ChatLimitError, ChatTimeoutError, postChat } from "../api/chat.js";
import { CourseContext } from "./courseContext.js";
import { useToast } from "../components/toastContext.js";

const STAGES = ["요청을 처리하고 있어요…", "AI 분석과 장소 조회에 시간이 걸리고 있어요. 잠시 기다려 주세요…"];
const FALLBACK_TEXT = "AI 응답이 잠시 불안정해요. 가까운 순으로 고른 기본 코스를 보여 드릴게요.";
const TIMEOUT_TEXT = "응답 대기 시간이 지났어요. 잠시 뒤 다시 보내 주세요.";
const ERROR_TEXT = "답을 받지 못했어요. 잠시 뒤 다시 보내 주세요.";
const REVISIONS = 1;

let nextId = 1;

export function CourseProvider({ children }) {
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [attached, setAttached] = useState(null);      // 전송 전 첨부 축제 (CM10-4)
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState(STAGES[0]);
  const [limited, setLimited] = useState(false);       // 하루 사용 한도 (CM10-9)
  const [course, setCourse] = useState(null);          // 마지막으로 만든 코스
  const [revisionsLeft, setRevisionsLeft] = useState(REVISIONS);
  const [revising, setRevising] = useState(false);
  const busy = useRef(false);
  const historyStart = useRef(0);                    // 완료된 코스의 조건이 다음 코스에 섞이지 않도록 분리
  const festivalRef = useRef(null);                    // 이번 대화에 첨부했던 축제

  const request = useCallback(async (userMsg, body) => {
    busy.current = true;
    setPending(true);
    setStage(STAGES[0]);
    const stageTimer = setTimeout(() => setStage(STAGES[1]), 15000);
    const history = [...messages.slice(historyStart.current), userMsg].map(({ role, text }) => ({ role, text }));
    setMessages((m) => [...m, userMsg]);
    try {
      const res = await postChat({ messages: history, ...body });
      const reply = { id: nextId++, role: "assistant", text: res.fallback ? FALLBACK_TEXT : res.text, kind: res.type,
        quickReplies: res.quickReplies, course: res.course };
      setMessages((m) => [...m, reply]);
      return res;
    } catch (err) {
      if (err instanceof ChatLimitError) {
        setLimited(true);
      } else {
        console.error(err);
        setMessages((m) => [...m, { id: nextId++, role: "assistant", text: err instanceof ChatTimeoutError ? TIMEOUT_TEXT : ERROR_TEXT, kind: "error" }]);
      }
      return null;
    } finally {
      clearTimeout(stageTimer);
      busy.current = false;
      setPending(false);
    }
  }, [messages]);

  /** 채팅 보내기. 코스가 나오면 그 코스를 돌려줌 */
  const send = useCallback(async (text, region) => {
    if (busy.current || limited || !text.trim()) return null;
    if (attached) festivalRef.current = attached;
    const userMsg = { id: nextId++, role: "user", text: text.trim(), festival: attached };
    setAttached(null);
    const res = await request(userMsg, { region: region ?? null, festivalId: festivalRef.current?.id ?? null, previousCourse: null });
    if (res?.type !== "course") return null;
    setCourse(res.course);
    festivalRef.current = null;
    historyStart.current = messages.length + 2;
    setRevisionsLeft(REVISIONS);
    return res.course;
  }, [attached, limited, request, messages.length]);

  /** R110 코스 수정 (1회) */
  const revise = useCallback(async (text) => {
    if (busy.current || limited || !course || revisionsLeft < 1 || !text.trim()) return null;
    setRevising(true);
    const userMsg = { id: nextId++, role: "user", text: text.trim() };
    const res = await request(userMsg, { region: course.regionCode, festivalId: course.places.find((p) => p.type === "festival")?.festivalId ?? null, previousCourse: course });
    setRevising(false);
    if (res?.type !== "course") {
      toast(res?.text || ERROR_TEXT);
      return null;
    }
    setRevisionsLeft((n) => n - 1);
    setCourse(res.course);
    historyStart.current = messages.length + 2;
    return res.course;
  }, [course, limited, request, revisionsLeft, messages.length, toast]);

  const value = useMemo(() => ({
    messages, attached, pending, stage, limited, course, revisionsLeft, revising,
    send, revise, attach: setAttached, detach: () => { setAttached(null); festivalRef.current = null; },
  }), [messages, attached, pending, stage, limited, course, revisionsLeft, revising, send, revise]);

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}
