import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const Ctx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [show, setShow] = useState(false);
  const t = useRef<number>();
  const toast = useCallback((m: string) => {
    setMsg(m); setShow(true);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setShow(false), 2600);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div id="toast" className={show ? "show" : ""} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
