import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { CHAT_MAX_LENGTH } from "../api/chat.js";
import { useCourse } from "../course/courseContext.js";
import PlaceMark from "./PlaceMark.jsx";

const EXAMPLES = [
  "부모님이랑 서산 반나절, 걷기 편하게",
  "아이랑 강릉에서 하루, 바다 보고 싶어요",
  "전주에서 맛집 위주로 하루",
];
const GREETING = "안녕하세요! 가고 싶은 지역과 함께 가는 사람, 시간, 취향을 편하게 말씀해 주세요.";

/** CM10 AI 코스 도우미 패널 (H110 · H120 오른쪽) */
export default function ChatPanel({ region, onCourse }) {
  const { messages, attached, pending, stage, limited, course, send, detach } = useCourse();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const input = useRef(null);
  const log = useRef(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages.length, pending, limited]);

  // D110 에서 축제를 붙여 오면 바로 입력할 수 있게
  useEffect(() => {
    if (attached) input.current?.focus();
  }, [attached]);

  async function submit(value = text) {
    if (!value.trim() || pending || limited) return;
    if (value === text) setText("");
    const made = await send(value, region);
    if (made) onCourse?.(made);
  }

  function onKeyDown(e) {
    // Enter 전송, Shift+Enter 줄바꿈 (한글 조합 중 Enter 는 무시)
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function fillExample(q) {
    setText(q);
    input.current?.focus();
  }

  const lastId = messages.at(-1)?.id;
  const canSend = text.trim() && !pending && !limited;

  return (
    <section className="chat" aria-label="AI 코스 도우미">
      <header className="chat__head">
        <h2 className="chat__title">AI 코스 도우미</h2>
        <p className="chat__sub">지도에 있는 장소 중에서만 골라 드려요</p>
      </header>

      <div className="chat__log" ref={log} aria-live="polite">
        <p className="bubble bubble--ai">{GREETING}</p>

        {messages.length === 0 && (
          <div className="chat__examples">
            <p className="chat__examples-title">이렇게 물어보세요</p>
            {EXAMPLES.map((q) => (
              <button key={q} type="button" className="chat__example" onClick={() => fillExample(q)}>{q}</button>
            ))}
          </div>
        )}

        {messages.map((m) => m.role === "user" ? (
          <div key={m.id} className="chat__mine">
            {m.festival && <span className="festival-chip">{m.festival.title}</span>}
            <p className="bubble bubble--me">{m.text}</p>
          </div>
        ) : (
          <div key={m.id} className={`bubble bubble--ai${m.kind === "error" ? " bubble--error" : ""}`}>
            <p>{m.text}</p>
            {m.course && <CourseSummary course={m.course} current={m.course === course}
              onOpen={() => navigate("/course")} />}
            {m.quickReplies && m.id === lastId && !pending && (
              <div className="chat__quick">
                {m.quickReplies.map((q) => (
                  <button key={q} type="button" className="chat__quick-btn" onClick={() => submit(q)}>{q}</button>
                ))}
              </div>
            )}
          </div>
        ))}

        {pending && (
          <div className="bubble bubble--ai chat__pending" role="status">
            <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            {stage}
          </div>
        )}

        {limited && (
          <p className="bubble bubble--ai bubble--warn">
            오늘은 더 이상 코스를 만들 수 없어요. 지도와 축제 정보는 계속 볼 수 있어요.
          </p>
        )}
      </div>

      <form className="chat__form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {attached && (
          <span className="festival-chip festival-chip--attached">
            {attached.title}
            <button type="button" onClick={detach} aria-label={`${attached.title} 첨부 빼기`}>✕</button>
          </span>
        )}
        <div className="chat__input-row">
          <label className="sr-only" htmlFor="chat-input">메시지</label>
          <textarea
            id="chat-input"
            ref={input}
            className="chat__input"
            rows={1}
            maxLength={CHAT_MAX_LENGTH}
            placeholder={limited ? "입력할 수 없어요" : "메시지를 입력하세요"}
            disabled={limited}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className="btn btn--primary chat__send" type="submit" disabled={!canSend}>전송</button>
        </div>
        {text.length > CHAT_MAX_LENGTH - 40 && (
          <p className="chat__count">{text.length} / {CHAT_MAX_LENGTH}</p>
        )}
      </form>
    </section>
  );
}

/** CM10-7 완성: 장소별 한 줄 이유 + [코스 자세히 보기] */
function CourseSummary({ course, current, onOpen }) {
  const noHours = course.places.some((p) => !p.hours);
  return (
    <div className="chat-course">
      <ol className="chat-course__list">
        {course.places.map((p, i) => (
          <li key={p.id}>
            <PlaceMark type={p.type} n={i + 1} />
            <span><strong>{p.title}</strong> · {p.reason}</span>
          </li>
        ))}
      </ol>
      {noHours && <p className="chat-course__warn">운영시간 정보가 없는 곳은 방문 전에 확인해 주세요.</p>}
      {current && (
        <button type="button" className="chat-course__open" onClick={onOpen}>
          코스 자세히 보기 <span aria-hidden="true">〉</span>
        </button>
      )}
    </div>
  );
}
