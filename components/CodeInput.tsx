"use client";

import { useRef } from "react";
import { keyClick } from "@/lib/audio";

export const SLOTS = 6;

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  onSubmit: () => void;
  error: boolean;
  disabled?: boolean;
}

/** Spread a run of digits across the boxes starting at `from`. Returns the last filled index. */
function distribute(values: string[], from: number, digits: string): { next: string[]; last: number } {
  const next = [...values];
  let i = from;
  let rest = digits;
  // Start the current box fresh so a paste overwrites it.
  while (rest.length > 0 && i < SLOTS) {
    next[i] = rest.slice(0, 3);
    rest = rest.slice(3);
    i += 1;
  }
  return { next, last: Math.min(i - 1, SLOTS - 1) };
}

export default function CodeInput({ values, onChange, onSubmit, error, disabled }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focus = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(SLOTS - 1, i))];
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  };

  const handleChange = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length > values[i].length) keyClick();
    if (digits.length <= 3) {
      const next = [...values];
      next[i] = digits;
      onChange(next);
      if (digits.length === 3 && i < SLOTS - 1) focus(i + 1);
      return;
    }
    // Autofill / IME delivered more than 3 digits: spill over.
    const { next, last } = distribute(values, i, digits);
    onChange(next);
    focus(next[last].length === 3 && last < SLOTS - 1 ? last + 1 : last);
  };

  const handlePaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!digits) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    keyClick();
    const start = digits.length >= SLOTS * 3 ? 0 : i;
    const { next, last } = distribute(values, start, digits.slice(0, (SLOTS - start) * 3));
    onChange(next);
    focus(next[last].length === 3 && last < SLOTS - 1 ? last + 1 : last);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && values[i] === "" && i > 0) {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0 && e.currentTarget.selectionStart === 0) {
      e.preventDefault();
      focus(i - 1);
    } else if (
      e.key === "ArrowRight" &&
      i < SLOTS - 1 &&
      e.currentTarget.selectionStart === values[i].length
    ) {
      e.preventDefault();
      focus(i + 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="code-grid" role="group" aria-label="Override sequence, six 3-digit parts">
      {values.map((v, i) => (
        <div className="code-cell" key={i}>
          <span className="dash" aria-hidden="true" style={i === 0 ? { visibility: "hidden" } : undefined}>
            -
          </span>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`code-box${v.length === 3 ? " full" : ""}${error ? " bad" : ""}`}
            value={v}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={SLOTS * 3}
            placeholder="___"
            aria-label={`Part ${i + 1} of ${SLOTS}`}
            disabled={disabled}
            onChange={(e) => handleChange(i, e.target.value)}
            onPaste={(e) => handlePaste(i, e)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => {
              const len = e.currentTarget.value.length;
              e.currentTarget.setSelectionRange(len, len);
            }}
          />
        </div>
      ))}
    </div>
  );
}
