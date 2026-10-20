"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  lines: readonly string[];
  /** Milliseconds per character. */
  speed?: number;
  /** Pause between lines (ms). */
  linePause?: number;
  className?: string;
  onDone?: () => void;
}

/** Types out lines one character at a time. Remount (via `key`) to restart. */
export default function Typewriter({ lines, speed = 22, linePause = 120, className, onDone }: Props) {
  const total = lines.reduce((n, l) => n + l.length, 0);
  const [count, setCount] = useState(0);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    let typed = 0;
    let timer: ReturnType<typeof setTimeout>;
    const boundaries = new Set<number>();
    let acc = 0;
    for (const l of lines) {
      acc += l.length;
      boundaries.add(acc);
    }
    const step = () => {
      typed += 1;
      setCount(typed);
      if (typed >= total) {
        timer = setTimeout(() => doneRef.current?.(), linePause);
        return;
      }
      timer = setTimeout(step, boundaries.has(typed) ? linePause : speed);
    };
    timer = setTimeout(step, speed);
    return () => clearTimeout(timer);
  }, [lines, total, speed, linePause]);

  const starts = lines.map((_, i) => lines.slice(0, i).reduce((n, l) => n + l.length, 0));
  // The line currently being typed (or the last one when finished) carries the cursor.
  let activeLine = lines.length - 1;
  if (count < total) {
    activeLine = -1;
    for (let i = starts.length - 1; i >= 0; i--) {
      if (starts[i] <= count) {
        activeLine = i;
        break;
      }
    }
  }
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const shown = line.slice(0, Math.max(0, Math.min(line.length, count - starts[i])));
        if (i > activeLine) return null;
        return (
          <p key={i} className={`typed${i === activeLine ? " cursor" : ""}`}>
            {shown}
          </p>
        );
      })}
    </div>
  );
}
