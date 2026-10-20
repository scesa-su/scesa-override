"use client";

import { useState } from "react";
import SplitTitle from "./SplitTitle";
import { keyClick, keyErase } from "@/lib/audio";

interface Props {
  busy: boolean;
  error: string | null;
  /** Server said the call-sign is taken: ask for the resume code. */
  needResume: boolean;
  onStart: (callsign: string, resumeCode?: string) => void;
  /** Called when the call-sign is edited, so a stale "taken" state is cleared. */
  onCallsignChange: () => void;
}

export default function Standby({ busy, error, needResume, onStart, onCallsignChange }: Props) {
  const [callsign, setCallsign] = useState("");
  const [resumeCode, setResumeCode] = useState("");
  const trimmed = callsign.trim();
  const valid =
    trimmed.length >= 1 && trimmed.length <= 32 && (!needResume || resumeCode.length === 6);

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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onStart(trimmed, needResume ? resumeCode : undefined);
        }}
      >
        <label className="field">
          <span>Enter Team Call-sign / Pair Name</span>
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
                if (needResume || resumeCode || error) {
                  setResumeCode("");
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
        {needResume && (
          <label className="field">
            <span>Resume Code (6 digits)</span>
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
                }}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                autoFocus
              />
            </span>
          </label>
        )}
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-big" disabled={!valid || busy}>
          {busy ? "INITIALIZING…" : "INITIALIZE SENTINEL OVERRIDE PROTOCOL"}
        </button>
      </form>
    </section>
  );
}
