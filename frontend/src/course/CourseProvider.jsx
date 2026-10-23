import { useCallback, useMemo, useRef, useState } from "react";
import { ChatLimitError, postChat } from "../api/chat.js";
import { CourseContext } from "./courseContext.js";

const STAGES = ["장소를 고르는 중…", "이동 시간을 계산하는 중…"];
const FALLBACK_TEXT = "AI 응답이 잠시 불안정해요. 가까운 순으로 고른 기본 코스를 보여 드릴게요.";
const ERROR_TEXT = "답을 받지 못했어요. 잠시 뒤 다시 보내 주세요.";
const REVISIONS = 1;

let nextId = 1;

export function CourseProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [attached, setAttached] = useState(null);      // 전송 전 첨부 축제 (CM10-4)
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState(STAGES[0]);
  const [limited, setLimited] = useState(false);       // 하루 사용 한도 (CM10-9)
  const [course, setCourse] = useState(null);          // 마지막으로 만든 코스
  const [revisionsLeft, setRevisionsLeft] = useState(REVISIONS);
  const [revising, setRevising] = useState(false);
  const busy = useRef(false);
  const festivalRef = useRef(null);                    // 이번 대화에 첨부했던 축제

  const request = useCallback(async (userMsg, body) => {
    busy.current = true;
    setPending(true);
    setStage(STAGES[0]);
    const stageTimer = setTimeout(() => setStage(STAGES[1]), 900);
    const history = [...messages, userMsg].map(({ role, text }) => ({ role, text }));
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
        setMessages((m) => [...m, { id: nextId++, role: "assistant", text: ERROR_TEXT, kind: "error" }]);
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
    setRevisionsLeft(REVISIONS);
    return res.course;
  }, [attached, limited, request]);

  /** R110 코스 수정 (1회) */
  const revise = useCallback(async (text) => {
    if (busy.current || limited || !course || revisionsLeft < 1 || !text.trim()) return null;
    setRevising(true);
    const userMsg = { id: nextId++, role: "user", text: text.trim() };
    const res = await request(userMsg, { region: course.regionCode, festivalId: festivalRef.current?.id ?? null, previousCourse: course });
    setRevising(false);
    if (res?.type !== "course") return null;
    setRevisionsLeft((n) => n - 1);
    setCourse(res.course);
    return res.course;
  }, [course, limited, request, revisionsLeft]);

  const value = useMemo(() => ({
    messages, attached, pending, stage, limited, course, revisionsLeft, revising,
    send, revise, attach: setAttached, detach: () => setAttached(null),
  }), [messages, attached, pending, stage, limited, course, revisionsLeft, revising, send, revise]);

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}
