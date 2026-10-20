"use client";

import { useSyncExternalStore } from "react";
import { beep, isMuted, setMuted, subscribeMuted, unlockAudio } from "@/lib/audio";

export default function MuteToggle() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button
      type="button"
      className="btn mute"
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      onClick={() => {
        unlockAudio();
        setMuted(!muted);
        if (muted) beep();
      }}
    >
      {muted ? "SOUND: OFF" : "SOUND: ON"}
    </button>
  );
}
