"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { alarm, beep, confirmBlip, errorBuzz, unlockAudio, victoryChime } from "@/lib/audio";
import type { EventInfo, SessionView } from "@/lib/types";
import AntiInspect from "./AntiInspect";
import BootSequence from "./BootSequence";
import Console from "./Console";
import MuteToggle from "./MuteToggle";
import Standby from "./Standby";
import Vault from "./Vault";

type Phase = "loading" | "standby" | "boot" | "console" | "vault";

export default function Terminal() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [session, setSession] = useState<SessionView | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [flash, setFlash] = useState<"" | "red" | "green">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needResume, setNeedResume] = useState(false);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [eventOffsetMs, setEventOffsetMs] = useState(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((s: SessionView) => {
    setSession(s);
    setOffsetMs(s.serverNow - Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .event()
      .then((r) => {
        if (cancelled || r.status !== 200 || !r.data) return;
        setEvent(r.data);
        setEventOffsetMs(r.data.serverNow - Date.now());
      })
      .catch(() => {
        /* no event info: the portal works as a walk-in terminal */
      });
    api
      .session()
      .then((r) => {
        if (cancelled) return;
        if (r.status === 200 && r.data) {
          adopt(r.data);
          setPhase(r.data.solved ? "vault" : "console");
        } else {
          setPhase("standby");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("standby");
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const triggerFlash = useCallback((kind: "red" | "green") => {
    setFlash("");
    if (flashTimer.current) clearTimeout(flashTimer.current);
    // Next frame so the animation restarts on repeated failures.
    requestAnimationFrame(() => {
      setFlash(kind);
      flashTimer.current = setTimeout(() => setFlash(""), 1000);
    });
  }, []);

  const sessionLost = useCallback(() => {
    setSession(null);
    setError("SESSION EXPIRED. RE-ENTER YOUR CALL-SIGN TO RESUME.");
    setPhase("standby");
  }, []);

  const start = async (callsign: string, resumeCode?: string) => {
    unlockAudio();
    beep();
    setBusy(true);
    setError(null);
    try {
      const r = await api.start(callsign, resumeCode);
      if (r.status === 200 && r.data) {
        setNeedResume(false);
        confirmBlip();
        adopt(r.data);
        if (r.data.solved) {
          setPhase("vault");
        } else {
          alarm();
          setPhase("boot");
        }
      } else if (r.status === 400) {
        errorBuzz();
        setError("INVALID CALL-SIGN. USE 1-32 CHARACTERS.");
      } else if (r.status === 403) {
        errorBuzz();
        const code = (r.data as unknown as { error?: string; startsAt?: number } | null)?.error;
        setError(
          code === "not_started"
            ? "THE CASE FILE IS NOT OPEN YET. WAIT FOR THE COUNTDOWN."
            : code === "needs_partner"
              ? "YOUR TEAM NEEDS A PARTNER. ALERT THE GROUP ADMINS WITH YOUR PARTNER'S NAME."
              : code === "not_registered"
              ? "TEAM NOT REGISTERED. ENTER YOUR TEAM LEADER'S FIRST NAME ONLY."
              : "THE HUNT HAS ENDED. NO NEW TEAMS CAN START.",
        );
      } else if (r.status === 409) {
        errorBuzz();
        setNeedResume(true);
        const code = (r.data as unknown as { error?: string } | null)?.error;
        setError(
          code === "code_required"
            ? resumeCode
              ? "WRONG TEAM CODE. CHECK IT AND TRY AGAIN."
              : "ENTER YOUR TEAM ACCESS CODE."
            : "CALL-SIGN IN USE — ENTER YOUR RESUME CODE OR PICK ANOTHER NAME",
        );
      } else if (r.status === 429) {
        errorBuzz();
        setError("TOO MANY ATTEMPTS — WAIT A FEW MINUTES OR ASK AN ORGANISER");
      } else if (r.status === 503) {
        errorBuzz();
        setError("SYSTEM BUSY — TRY AGAIN.");
      } else {
        errorBuzz();
        setError("SERVER ERROR — TELL AN ORGANISER");
      }
    } catch {
      errorBuzz();
      setError("CONNECTION LOST. TRY AGAIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={`crt${flash ? ` flash-${flash}` : ""}`}>
      <MuteToggle />
      <AntiInspect />

      {phase === "loading" && (
        <section className="screen">
          <p className="typed cursor">ESTABLISHING SECURE LINK</p>
        </section>
      )}

      {phase === "standby" && <Standby
          busy={busy}
          error={error}
          needResume={needResume}
          event={event}
          offsetMs={eventOffsetMs}
          onStart={start}
          onCallsignChange={() => {
            setNeedResume(false);
            setError(null);
          }}
        />}

      {phase === "boot" && <BootSequence onDone={() => setPhase("console")} />}

      {phase === "console" && session && (
        <Console
          session={session}
          offsetMs={offsetMs}
          onFlash={triggerFlash}
          onSessionLost={sessionLost}
          onHints={(hints, penaltySeconds) => setSession({ ...session, hints, penaltySeconds })}
          onSolved={(solved, vault) => {
            setSession({ ...session, solved, vault, cooldownMs: 0 });
            triggerFlash("green");
            victoryChime();
            setPhase("vault");
          }}
        />
      )}

      {phase === "vault" && session && (
        <Vault
          session={session}
          onSessionLost={sessionLost}
          onClaimed={(claim, rank, banner) =>
            setSession({
              ...session,
              claim,
              rank,
              vault: session.vault ? { ...session.vault, banner } : session.vault,
            })
          }
        />
      )}
    </main>
  );
}
