"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, fmtClock, fmtPenalty } from "@/lib/api";
import { beep, errorBuzz, readyPing, unlockAudio } from "@/lib/audio";
import type { HintGroupView, SessionView, SolvedTimes, VaultContent } from "@/lib/types";
import CodeInput, { SLOTS } from "./CodeInput";
import Briefing from "./Briefing";
import HintPanel from "./HintPanel";

// ---- a 1 Hz wall clock shared via an external store (display only)
function subscribeClock(cb: () => void) {
  const id = setInterval(cb, 250);
  return () => clearInterval(id);
}
const clockSnapshot = () => Math.floor(Date.now() / 1000);
const clockServerSnapshot = () => 0;

interface Props {
  session: SessionView;
  /** serverNow - clientNow, in ms (display only). */
  offsetMs: number;
  onFlash: (kind: "red" | "green") => void;
  onSolved: (solved: SolvedTimes, vault: VaultContent) => void;
  onHints: (hints: HintGroupView[], penaltySeconds: number) => void;
  onSessionLost: () => void;
}

export default function Console({ session, offsetMs, onFlash, onSolved, onHints, onSessionLost }: Props) {
  const [values, setValues] = useState<string[]>(() => Array(SLOTS).fill(""));
  const briefKey = `scesa-override:briefed:${session.startTime}`;
  const [showBrief, setShowBrief] = useState(() => {
    try {
      return window.localStorage.getItem(briefKey) !== "1";
    } catch {
      return true;
    }
  });
  const closeBrief = () => {
    setShowBrief(false);
    try {
      window.localStorage.setItem(briefKey, "1");
    } catch {
      /* storage unavailable: the briefing may show again on reload */
    }
  };
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [lockLeft, setLockLeft] = useState(session.cooldownMs);
  const lockTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const nowSec = useSyncExternalStore(subscribeClock, clockSnapshot, clockServerSnapshot);

  const startLock = (ms: number) => {
    if (lockTimer.current) clearInterval(lockTimer.current);
    const until = Date.now() + ms;
    setLockLeft(ms);
    lockTimer.current = setInterval(() => {
      const left = Math.max(0, until - Date.now());
      setLockLeft(left);
      if (left === 0 && lockTimer.current) {
        clearInterval(lockTimer.current);
        lockTimer.current = null;
        readyPing();
      }
    }, 100);
  };

  useEffect(() => {
    // Resume a server cooldown that was still running at load time.
    const initial = session.cooldownMs;
    if (initial > 0) {
      const until = Date.now() + initial;
      lockTimer.current = setInterval(() => {
        const left = Math.max(0, until - Date.now());
        setLockLeft(left);
        if (left === 0 && lockTimer.current) {
          clearInterval(lockTimer.current);
          lockTimer.current = null;
        }
      }, 100);
    }
    return () => {
      if (lockTimer.current) clearInterval(lockTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsed =
    nowSec === 0 ? 0 : Math.max(0, Math.floor((nowSec * 1000 + offsetMs - session.startTime) / 1000));
  const complete = values.every((v) => /^\d{3}$/.test(v));
  const locked = lockLeft > 0;

  const execute = async () => {
    unlockAudio();
    if (!complete || locked || busy) return;
    setBusy(true);
    setNetError(null);
    try {
      const r = await api.verify(values);
      const d = r.data;
      if (r.status === 200 && d && d.ok) {
        setDenied(false);
        onSolved(
          {
            rawTime: d.rawTime,
            penaltyTime: d.penaltyTime,
            totalScoreTime: d.totalScoreTime,
            completedAt: d.completedAt,
          },
          d.vault,
        );
        return;
      }
      if (r.status === 401 && d && "cooldownMs" in d) {
        setDenied(true);
        onFlash("red");
        errorBuzz();
        startLock(d.cooldownMs ?? 3000);
      } else if (r.status === 429 && d && !d.ok) {
        errorBuzz();
        startLock(d.retryAfterMs ?? 3000);
      } else if (r.status === 401) {
        onSessionLost();
      } else if (r.status === 400) {
        setNetError("EACH PART MUST BE EXACTLY 3 DIGITS.");
      } else {
        setNetError("CONNECTION FAULT. TRY AGAIN.");
      }
    } catch {
      setNetError("CONNECTION LOST. TRY AGAIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="screen" aria-labelledby="console-title">
      <div className="statusbar" aria-live="off">
        <div>
          CALL-SIGN<b>{session.callsign}</b>
        </div>
        <div>
          ELAPSED<b>{fmtClock(elapsed)}</b>
        </div>
        <div>
          PENALTY<b>+{fmtPenalty(session.penaltySeconds)}</b>
        </div>
        <div>
          ADJUSTED<b>{fmtClock(elapsed + session.penaltySeconds)}</b>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          RESUME CODE: <b style={{ display: "inline" }}>{session.resumeCode}</b>{" "}
          <span className="muted-text">(write this down)</span>
        </div>
      </div>

      <h1 id="console-title" className="head" style={{ fontSize: "clamp(1.5rem, 6vw, 2.2rem)" }}>
        ENTER 6-PART OVERRIDE SEQUENCE
      </h1>
      <p className="muted-text">[___]-[___]-[___]-[___]-[___]-[___]</p>

      <CodeInput
        values={values}
        onChange={(v) => {
          setValues(v);
          if (denied) setDenied(false);
        }}
        onSubmit={execute}
        error={denied}
      />

      {denied && (
        <p className="err denied" role="alert">
          ACCESS DENIED: INVALID OVERRIDE SEQUENCE
        </p>
      )}
      {netError && (
        <p className="err" role="alert">
          {netError}
        </p>
      )}

      <button
        type="button"
        className={`btn btn-big${locked ? " btn-danger" : ""}`}
        onClick={() => {
          beep();
          void execute();
        }}
        disabled={!complete || locked || busy}
      >
        {locked
          ? `LOCKOUT // RETRY IN ${Math.ceil(lockLeft / 1000)}s`
          : busy
            ? "TRANSMITTING…"
            : "EXECUTE OVERRIDE"}
      </button>

      <button
        type="button"
        className="btn brief-btn"
        onClick={() => {
          beep();
          setShowBrief(true);
        }}
      >
        [ MISSION BRIEFING ]
      </button>

      <HintPanel
        hints={session.hints}
        locked={busy}
        nowMs={nowSec === 0 ? 0 : nowSec * 1000 + offsetMs}
        onUpdate={onHints}
        onSessionLost={onSessionLost}
      />
      {showBrief && <Briefing resumeCode={session.resumeCode} onClose={closeBrief} />}
    </section>
  );
}
