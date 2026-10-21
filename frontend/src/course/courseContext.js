import { createContext, useContext } from "react";

export const CourseContext = createContext(null);

/** AI 코스 도우미 대화 · 코스 상태 (새로고침 전까지 유지, 저장 안 함) */
export function useCourse() {
  return useContext(CourseContext);
}
