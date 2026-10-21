import { createContext, useContext } from "react";

export const ToastContext = createContext(() => {});

/** 토스트 띄우기: const toast = useToast(); toast("메시지") */
export function useToast() {
  return useContext(ToastContext);
}
