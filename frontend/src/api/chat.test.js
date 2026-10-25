import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let server;
let api;
const originalFetch = globalThis.fetch;
const request = { messages: [{ role: "user", text: "강릉에서 하루" }], region: "gangwon" };

before(async () => {
  server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  api = await server.ssrLoadModule("/src/api/chat.js");
});
after(async () => {
  globalThis.fetch = originalFetch;
  await server?.close();
});

test("real chat sends prior conversation, selected region, festival and course", async () => {
  const course = { region: "강릉", regionCode: "gangwon", places: [] };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/chat");
    assert.equal(options.method, "POST");
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), {
      message: "맛집 추가", history: [{ role: "assistant", content: "코스를 만들었어요" }],
      region: "gangwon", festival_id: "123", previous_course: course,
    });
    return Response.json({ answer: "수정했어요", course });
  };
  const reply = await api.postChat({
    messages: [{ role: "assistant", text: "코스를 만들었어요" }, { role: "user", text: "맛집 추가" }],
    region: "gangwon", festivalId: "123", previousCourse: course,
  });
  assert.equal(reply.type, "course");
  assert.equal(reply.course.regionCode, "gangwon");
});

test("city-name course resolves its map region", async () => {
  globalThis.fetch = async (url) => url === "/api/chat"
    ? Response.json({ answer: "완료", course: { region: "강릉", places: [] } })
    : Response.json([{ code: "51", name: "강원특별자치도", sigungu: [{ code: "150", name: "강릉시" }] }]);
  assert.equal((await api.postChat(request)).course.regionCode, "gangwon");
});

test("AI unavailable response stays an error instead of a course", async () => {
  globalThis.fetch = async () => Response.json({ answer: "AI 서버에 연결할 수 없어요", conditions: null });
  assert.equal((await api.postChat(request)).type, "error");
});

test("HTTP failures and rate limits propagate to the chat UI", async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(api.postChat(request), /503/);
  globalThis.fetch = async () => new Response(null, { status: 429 });
  await assert.rejects(api.postChat(request), api.ChatLimitError);
});

test("slow chat aborts and reports timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  });
  const pending = api.postChat(request);
  const assertion = assert.rejects(pending, api.ChatTimeoutError);
  t.mock.timers.tick(300_000);
  await assertion;
  t.mock.timers.reset();
});
