"use client";

import { useState } from "react";
import { api, fmtMinutes } from "@/lib/api";
import { beep, errorBuzz } from "@/lib/audio";
import type { HintGroupView } from "@/lib/types";

interface Props {
  hints: HintGroupView[];
  locked: boolean;
  onUpdate: (hints: HintGroupView[], penaltySeconds: number) => void;
  onSessionLost: () => void;
}

interface Pending {
  artifact: number;
  index: number;
  penaltySeconds: number;
}

export default function HintPanel({ hints, locked, onUpdate, onSessionLost }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.hint(pending.artifact, pending.index);
      if (r.status === 200) {
        beep();
        onUpdate(r.data.hints, r.data.penaltySeconds);
        setPending(null);
      } else if (r.status === 401) {
        onSessionLost();
      } else {
        errorBuzz();
        setError("HINT REQUEST REJECTED. REFRESH AND TRY AGAIN.");
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
        {[...hints]
          // Roadmap first, then alphabetical by title, so the panel does not reveal code order.
          .sort((a, b) => (a.artifact === 0 ? -1 : b.artifact === 0 ? 1 : a.title.localeCompare(b.title)))
          .map((g) => {
          const next = g.revealed.length;
          return (
            <div className="hint-group" key={g.artifact}>
              <h3>
                {g.title} —{" "}
                {g.penaltySeconds === 0 ? "FREE" : `+${fmtMinutes(g.penaltySeconds)} MIN EACH`}
              </h3>
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
                        disabled={!isNext || locked}
                        onClick={() => {
                          beep();
                          setPending({ artifact: g.artifact, index, penaltySeconds: g.penaltySeconds });
                        }}
                      >
                        {isNext ? "[ REVEAL ]" : "[ LOCKED ]"} HINT {index + 1}/{g.total} · PENALTY +
                        {fmtMinutes(g.penaltySeconds)} MIN
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
              CONFIRM: REVEAL HINT? PENALTY +{fmtMinutes(pending.penaltySeconds)} MIN
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
