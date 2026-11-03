import { useEffect, useRef } from "react";

/** One tooltip for the whole app: any element with data-tip="<b>html</b>" shows it on hover. */
export function Tip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tip = ref.current!;
    const move = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.("[data-tip]") as HTMLElement | null;
      if (!el || !el.dataset.tip) { tip.style.opacity = "0"; return; }
      tip.innerHTML = el.dataset.tip; // tip strings are built by our own code, never from user input
      tip.style.opacity = "1";
      const r = tip.getBoundingClientRect();
      tip.style.left = Math.min(innerWidth - r.width - 10, Math.max(10, e.clientX - r.width / 2)) + "px";
      tip.style.top = e.clientY - r.height - 12 + "px";
    };
    document.addEventListener("mousemove", move);
    return () => document.removeEventListener("mousemove", move);
  }, []);
  return <div id="tip" ref={ref} />;
}
