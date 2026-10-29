"use client";

import { useEffect, useState } from "react";
import SplitTitle from "./SplitTitle";
import { keyClick, keyErase, readyPing } from "@/lib/audio";
import { api } from "@/lib/api";
import type { EventInfo } from "@/lib/types";

function fmtCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h > 0 ? `${pad(h)}:` : ""}${pad(m)}:${pad(s % 60)}`;
}

interface Props {
  busy: boolean;
  error: string | null;
  /** Server said the call-sign is taken: ask for the resume code. */
  needResume: boolean;
  onStart: (callsign: string, resumeCode?: string) => void;
  /** Called when the call-sign is edited, so a stale "taken" state is cleared. */
  onCallsignChange: () => void;
  /** Online-event settings, or null while loading / for walk-in play. */
  event: EventInfo | null;
  /** serverNow - clientNow, in ms (display only). */
  offsetMs: number;
}

export default function Standby({ busy, error, needResume, onStart, onCallsignChange, event, offsetMs }: Props) {
  const [callsign, setCallsign] = useState("");
  const [resumeCode, setResumeCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [check, setCheck] = useState<{ members: string[]; ready: boolean } | string | null>(null);
  const [checking, setChecking] = useState(false);
  const teamCodes = event?.teamCodes ?? false;
  const askCode = needResume || teamCodes;
  const opensIn = event?.startsAt ? event.startsAt - (now + offsetMs) : 0;
  const waiting = opensIn > 0;
  const ended = event?.endsAt ? now + offsetMs >= event.endsAt : false;
  const trimmed = callsign.trim();
  const valid =
    trimmed.length >= 1 && trimmed.length <= 32 && (!askCode || resumeCode.length === 6) && !waiting;

  async function verifyTeam() {
    setChecking(true);
    const r = await api.team(trimmed, resumeCode).catch(() => null);
    setChecking(false);
    if (r?.status === 200) setCheck(r.data);
    else if (r?.status === 403) setCheck("TEAM NOT REGISTERED. ENTER YOUR TEAM LEADER'S FIRST NAME ONLY.");
    else if (r?.status === 401) setCheck("WRONG ACCESS CODE. CHECK THE CODE SHARED IN THE GROUP.");
    else if (r?.status === 429) setCheck("TOO MANY ATTEMPTS. WAIT 10 MINUTES AND TRY AGAIN.");
    else setCheck("COULD NOT VERIFY RIGHT NOW. TRY AGAIN.");
  }

  useEffect(() => {
    if (!event?.startsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [event?.startsAt]);

  useEffect(() => {
    // Ping once when the countdown reaches zero.
    if (event?.startsAt && !waiting && Date.now() + offsetMs - event.startsAt < 1000) readyPing();
  }, [waiting, event?.startsAt, offsetMs]);

  return (
    <section className="screen" aria-labelledby="portal-title">
      <p className="org">STRATHMORE COMPUTING &amp; ENGINEERING STUDENTS ASSOCIATION</p>
      <SplitTitle
        as="h1"
        id="portal-title"
        className="head title"
        text="SENTINEL EMERGENCY OVERRIDE PORTAL // AIR-GAP RECOVERY"
      />
      <p className="status">
        SYSTEM STATUS: <span className="off">OFFLINE</span> — CORE INFRASTRUCTURE LOCKED AT 10:28 AM
      </p>

      {waiting && (
        <p className="status" role="timer">
          CASE FILE OPENS IN <b>{fmtCountdown(opensIn)}</b>
        </p>
      )}
      {ended && <p className="status">THE HUNT HAS ENDED. REGISTERED TEAMS CAN STILL LOG IN TO SEE THEIR RESULT.</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onStart(trimmed, askCode ? resumeCode : undefined);
        }}
      >
        <label className="field">
          <span>{teamCodes ? "Team Name (Team Leader's First Name)" : "Enter Team Call-sign / Pair Name"}</span>
          <span className="term-input">
            <span className="mirror" aria-hidden="true">
              {callsign ? callsign : <span className="placeholder">_</span>}
            </span>
            <input
              name="callsign"
              value={callsign}
              onChange={(e) => {
                const v = e.target.value.slice(0, 32);
                if (v.length > callsign.length) keyClick();
                else if (v.length < callsign.length) keyErase();
                setCallsign(v);
                setCheck(null);
                if (needResume || resumeCode || error) {
                  if (!teamCodes) setResumeCode("");
                  onCallsignChange();
                }
              }}
              required
              minLength={1}
              maxLength={32}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
            />
          </span>
        </label>
        {askCode && (
          <label className="field">
            <span>{teamCodes ? "Team Access Code (6 digits)" : "Resume Code (6 digits)"}</span>
            <span className="term-input">
              <span className="mirror" aria-hidden="true">
                {resumeCode ? resumeCode : <span className="placeholder">______</span>}
              </span>
              <input
                name="resumeCode"
                value={resumeCode}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  if (v.length > resumeCode.length) keyClick();
                  else if (v.length < resumeCode.length) keyErase();
                  setResumeCode(v);
                  setCheck(null);
                }}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                autoFocus={needResume}
              />
            </span>
          </label>
        )}
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        {teamCodes && (
          <button
            type="button"
            className="btn"
            disabled={!trimmed || resumeCode.length !== 6 || checking}
            onClick={verifyTeam}
          >
            {checking ? "VERIFYING…" : "VERIFY TEAM"}
          </button>
        )}
        {typeof check === "string" && (
          <p className="err" role="alert">
            {check}
          </p>
        )}
        {check && typeof check === "object" && (
          <div className="status" role="status">
            {check.members.length > 0 && (
              <p>
                TEAM MEMBERS: <b>{check.members.join(" & ")}</b>
              </p>
            )}
            {check.ready ? (
              <p>✔ VERIFIED. YOUR TEAM IS CLEARED TO TAKE PART IN THE MYSTERY.</p>
            ) : (
              <p className="off">
                YOUR TEAM NEEDS A PARTNER. YOU CAN&apos;T TAKE PART UNTIL YOU HAVE ONE. ALERT THE GROUP ADMINS
                WITH YOUR NEW PARTNER&apos;S NAME.
              </p>
            )}
          </div>
        )}
        <button type="submit" className="btn btn-big" disabled={!valid || busy}>
          {busy ? "INITIALIZING…" : waiting ? "STAND BY…" : "INITIALIZE SENTINEL OVERRIDE PROTOCOL"}
        </button>
      </form>
    </section>
  );
}
