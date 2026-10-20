"use client";

import { useEffect, useRef } from "react";
import { confirmBlip } from "@/lib/audio";
import SplitTitle from "./SplitTitle";

interface Props {
  resumeCode: string;
  onClose: () => void;
}

/** Mission briefing shown once when a team first reaches the console; reopenable any time. */
export default function Briefing({ resumeCode, onClose }: Props) {
  const ack = useRef<HTMLButtonElement>(null);
  // Latest onClose without re-running the mount effect on every parent render (the clock ticks often).
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    ack.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="brief-title">
      <div className="dialog briefing">
        <p className="classified" aria-hidden="true">
          ▌ CLASSIFIED ▐
        </p>
        <SplitTitle as="h2" id="brief-title" className="head dialog-title" text="MISSION BRIEFING // EYES ONLY" />

        <div className="brief-section">
          <h3>SITUATION</h3>
          <p>
            At 10:28 AM someone on the SCESA executive board tripped the Sentinel lockdown. The keynote archive is
            encrypted, and whoever did it panicked and fled — leaving their papers behind.
          </p>
        </div>

        <div className="brief-section">
          <h3>OBJECTIVE</h3>
          <p>
            Recover the <b>6-part override sequence</b> hidden across the evidence, enter it on this terminal and
            unmask the culprit.
          </p>
        </div>

        <div className="brief-section">
          <h3>RULES OF ENGAGEMENT</h3>
          <ul>
            <li>Your clock is running and is kept by the server — refreshing won&apos;t pause it.</li>
            <li>Operator hints cost time. Each one shows its penalty before you confirm.</li>
            <li>A wrong sequence locks the terminal for 3 seconds.</li>
            <li>Lowest adjusted time (clock + penalties) wins.</li>
          </ul>
        </div>

        <div className="brief-code">
          RESUME CODE <b>{resumeCode}</b>
          <span className="muted-text">
            Write it down. You&apos;ll need it if you switch device or clear your browser.
          </span>
        </div>

        <p className="muted-text">Tip: the group chat is a good place to start.</p>

        <button
          ref={ack}
          type="button"
          className="btn btn-big"
          onClick={() => {
            confirmBlip();
            onClose();
          }}
        >
          ACKNOWLEDGE &amp; BEGIN
        </button>
      </div>
    </div>
  );
}
