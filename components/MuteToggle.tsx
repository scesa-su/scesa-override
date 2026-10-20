"use client";

import { useSyncExternalStore } from "react";
import { beep, isEnabled, setEnabled, subscribeAudio, unlockAudio } from "@/lib/audio";

function useChannel(ch: "sfx" | "music"): boolean {
  return useSyncExternalStore(
    subscribeAudio,
    () => isEnabled(ch),
    () => ch === "sfx",
  );
}

/** Fixed top-right MUSIC and SFX switches; both settings are remembered per browser. */
export default function MuteToggle() {
  const music = useChannel("music");
  const sfxOn = useChannel("sfx");
  return (
    <div className="sound-controls" role="group" aria-label="Sound settings">
      <button
        type="button"
        className="btn mute"
        aria-pressed={music}
        aria-label={music ? "Turn music off" : "Turn music on"}
        onClick={() => {
          unlockAudio();
          setEnabled("music", !music);
        }}
      >
        ♪ MUSIC: {music ? "ON" : "OFF"}
      </button>
      <button
        type="button"
        className="btn mute"
        aria-pressed={sfxOn}
        aria-label={sfxOn ? "Turn sound effects off" : "Turn sound effects on"}
        onClick={() => {
          unlockAudio();
          setEnabled("sfx", !sfxOn);
          if (!sfxOn) beep();
        }}
      >
        SFX: {sfxOn ? "ON" : "OFF"}
      </button>
    </div>
  );
}
