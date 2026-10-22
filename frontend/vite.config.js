import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ command }) => {
  // 저장소 루트 .env 를 읽음 (KAKAO_JS_KEY)
  const env = loadEnv("", rootDir, "");

  return {
    // 빌드 결과는 FastAPI 가 /view 로 띄우므로 경로 앞에 /view/ 를 붙임
    base: command === "build" ? "/view/" : "/",
    plugins: [
      react(),
      {
        // 개발 서버에서만 카카오 키를 넣음. 빌드 결과에는 자리표시자를 남기고 FastAPI 가 채움
        name: "inject-kakao-key",
        apply: "serve",
        transformIndexHtml: (html) => html.replace("{{KAKAO_JS_KEY}}", env.KAKAO_JS_KEY ?? ""),
      },
    ],
    build: {
      outDir: "../view",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      // 백엔드 API 는 FastAPI(8000) 로 넘김
      proxy: { "/api": "http://localhost:8000" },
    },
  };
});
