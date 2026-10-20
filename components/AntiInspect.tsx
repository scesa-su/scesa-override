"use client";

import { useEffect, useRef, useState } from "react";

const MESSAGE = "ACCESS RESTRICTED: NICE TRY, HACKER.";

/** Cosmetic deterrent only; all real security is server-side. */
export default function AntiInspect() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 2200);
    };
    const onContext = (e: MouseEvent) => {
      // Let the native menu through on fields so long-press / right-click paste works.
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      show();
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const blocked =
        e.key === "F12" ||
        (mod && e.shiftKey && (key === "i" || key === "j" || key === "c")) ||
        (mod && e.altKey && (key === "i" || key === "j" || key === "c")) ||
        (mod && key === "u");
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
        show();
      }
    };
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <div className="toast" role="alert">
      {MESSAGE}
    </div>
  );
}
