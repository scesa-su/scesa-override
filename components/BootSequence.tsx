"use client";

import Typewriter from "./Typewriter";

const BOOT_LINES = [
  "> SENTINEL RECOVERY KERNEL v4.0.2 ........ OK",
  "> AIR-GAP LINK HANDSHAKE ................. OK",
  "> CORE LOCK DETECTED @ 10:28 AM .......... !!",
  "> LOADING OVERRIDE CONSOLE ............... OK",
];

export default function BootSequence({ onDone }: { onDone: () => void }) {
  return (
    <section className="screen" aria-live="polite">
      <Typewriter lines={BOOT_LINES} speed={6} linePause={90} onDone={onDone} />
    </section>
  );
}
