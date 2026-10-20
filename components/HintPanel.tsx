"use client";

import { useEffect, useRef, useState } from "react";
import { api, fmtClock, fmtPenalty } from "@/lib/api";
import { beep, errorBuzz, hintReveal, readyPing } from "@/lib/audio";
import type { HintGroupView } from "@/lib/types";

interface Props {
  hints: HintGroupView[];
  locked: boolean;
  /** Current server time estimate in ms (0 before hydration). */
  nowMs: number;
  onUpdate: (hints: HintGroupView[], penaltySeconds: number) => void;
  onSessionLost: () => void;
}

interface Pending {
  group: string;
  index: number;
  penaltySeconds: number;
}

export default function HintPanel({ hints, locked, nowMs, onUpdate, onSessionLost }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ping once when a timed hint group (e.g. the roadmap) unlocks while the console is open.
  const lockedGroups = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!nowMs) return;
    const nowLocked = new Set(hints.filter((g) => g.unlocksAt && g.unlocksAt > nowMs).map((g) => g.id));
    const prev = lockedGroups.current;
    if (prev && [...prev].some((a) => !nowLocked.has(a))) readyPing();
    lockedGroups.current = nowLocked;
  }, [hints, nowMs]);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.hint(pending.group, pending.index);
      if (r.status === 200) {
        hintReveal();
        onUpdate(r.data.hints, r.data.penaltySeconds);
        setPending(null);
      } else if (r.status === 401) {
        onSessionLost();
      } else {
        errorBuzz();
        setError(
          r.data?.error === "not_yet_available"
            ? "HINT STILL ENCRYPTED. WAIT FOR THE COUNTDOWN."
            : "HINT REQUEST REJECTED. REFRESH AND TRY AGAIN.",
        );
        setPending(null);
      }
    } catch {
      setError("CONNECTION LOST. TRY AGAIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="panel" onToggle={() => beep()}>
      <summary>REQUEST OPERATOR HINTS</summary>
      <div className="panel-body">
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {/* The server already orders groups (roadmap first, then alphabetical) and hides slot numbers. */}
        {hints.map((g) => {
          const next = g.revealed.length;
          const waitMs = g.unlocksAt && nowMs ? Math.max(0, g.unlocksAt - nowMs) : g.unlocksAt ? 1 : 0;
          return (
            <div className="hint-group" key={g.id}>
              <h3>
                {g.title}
                {g.penalties.every((p) => p === 0) ? " — FREE" : ""}
              </h3>
              {waitMs > 0 && next === 0 && (
                <p className="muted-text">
                  ENCRYPTED — UNLOCKS IN {nowMs ? fmtClock(waitMs / 1000) : "--:--"}
                </p>
              )}
              <ol className="hint-list">
                {g.revealed.map((text, i) => (
                  <li key={i}>
                    <p className="hint-text">
                      <span className="muted-text">HINT {i + 1}/{g.total}: </span>
                      {text}
                    </p>
                  </li>
                ))}
                {Array.from({ length: g.total - next }, (_, j) => {
                  const index = next + j;
                  const isNext = j === 0;
                  return (
                    <li key={index}>
                      <button
                        type="button"
                        className="btn hint-btn"
                        disabled={!isNext || locked || waitMs > 0}
                        onClick={() => {
                          beep();
                          setPending({ group: g.id, index, penaltySeconds: g.penalties[index] });
                        }}
                      >
                        {isNext && waitMs === 0 ? "[ REVEAL ]" : "[ LOCKED ]"} HINT {index + 1}/{g.total} ·{" "}
                        {g.penalties[index] === 0 ? "FREE" : `PENALTY +${fmtPenalty(g.penalties[index])}`}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>

      {pending && (
        <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="hint-confirm">
          <div className="dialog">
            <p id="hint-confirm" className="head" style={{ fontSize: "1.6rem" }}>
              {pending.penaltySeconds === 0
                ? "CONFIRM: REVEAL FREE HINT?"
                : `CONFIRM: REVEAL HINT? PENALTY +${fmtPenalty(pending.penaltySeconds)}`}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={confirm} disabled={busy} autoFocus>
                {busy ? "DECRYPTING…" : "CONFIRM"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setPending(null)}
                disabled={busy}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </details>
  );
}
