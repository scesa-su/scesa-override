"use client";

import { useState } from "react";
import { api, fmtClock, fmtPenalty } from "@/lib/api";
import { beep, errorBuzz } from "@/lib/audio";
import type { Claim, SessionView } from "@/lib/types";
import Typewriter from "./Typewriter";

interface Props {
  session: SessionView;
  onClaimed: (claim: Claim, rank: number | null, banner: string) => void;
  onSessionLost: () => void;
}

const NAME_RE = /^.{2,60}$/;
const ADM_RE = /^[A-Za-z0-9/-]{3,20}$/;

type Fields = { partner1Name: string; partner1Adm: string; partner2Name: string; partner2Adm: string };
const EMPTY: Fields = { partner1Name: "", partner1Adm: "", partner2Name: "", partner2Adm: "" };

function validate(f: Fields): (keyof Fields)[] {
  const bad: (keyof Fields)[] = [];
  if (!NAME_RE.test(f.partner1Name.trim())) bad.push("partner1Name");
  if (!ADM_RE.test(f.partner1Adm.trim())) bad.push("partner1Adm");
  if (!NAME_RE.test(f.partner2Name.trim())) bad.push("partner2Name");
  if (!ADM_RE.test(f.partner2Adm.trim())) bad.push("partner2Adm");
  return bad;
}

function ClaimForm({ onClaimed, onSessionLost }: Omit<Props, "session">) {
  const [f, setF] = useState<Fields>(EMPTY);
  const [bad, setBad] = useState<(keyof Fields)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validate(f);
    setBad(invalid);
    if (invalid.length) {
      errorBuzz();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.claim({
        partner1Name: f.partner1Name.trim(),
        partner1Adm: f.partner1Adm.trim(),
        partner2Name: f.partner2Name.trim(),
        partner2Adm: f.partner2Adm.trim(),
      });
      if (r.status === 200 && r.data?.claim) {
        beep();
        onClaimed(r.data.claim, r.data.rank, r.data.banner);
      } else if (r.status === 401) {
        onSessionLost();
      } else if (r.status === 400) {
        errorBuzz();
        setBad((r.data?.fields as (keyof Fields)[] | undefined) ?? []);
        setError("CHECK THE HIGHLIGHTED FIELDS.");
      } else {
        errorBuzz();
        setError("REGISTRATION FAILED. TRY AGAIN.");
      }
    } catch {
      setError("CONNECTION LOST. TRY AGAIN.");
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof Fields, label: string, adm: boolean) => (
    <label className="field">
      <span className={bad.includes(key) ? "err" : undefined}>
        {label}
        {bad.includes(key) ? (adm ? " — 3-20 chars: letters, digits, / or -" : " — 2-60 chars") : ""}
      </span>
      <input
        className="input"
        value={f[key]}
        required
        minLength={adm ? 3 : 2}
        maxLength={adm ? 20 : 60}
        pattern={adm ? "[A-Za-z0-9/\\-]{3,20}" : undefined}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={bad.includes(key)}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="claim-title">
      <form className="dialog" onSubmit={submit} noValidate>
        <h2 id="claim-title" className="head" style={{ fontSize: "1.7rem", lineHeight: 1.1 }}>
          CLAIM YOUR VICTORY // 1ST PLACE OFFICIAL REGISTRATION
        </h2>
        <p className="muted-text">Input details for both team members to record your official standing:</p>
        <fieldset className="fieldset">
          <legend>PARTNER 1</legend>
          {field("partner1Name", "Full Name", false)}
          {field("partner1Adm", "Admission Number", true)}
        </fieldset>
        <fieldset className="fieldset">
          <legend>PARTNER 2</legend>
          {field("partner2Name", "Full Name", false)}
          {field("partner2Adm", "Admission Number", true)}
        </fieldset>
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-big" disabled={busy}>
          {busy ? "REGISTERING…" : "RECORD OFFICIAL STANDING"}
        </button>
      </form>
    </div>
  );
}

function Certificate({ claim, rank, banner }: { claim: Claim; rank: number | null; banner: string }) {
  const when = new Date(claim.completedAt).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "medium",
  });
  return (
    <div className="cert">
      <p className="org">SENTINEL OVERRIDE // OFFICIAL CERTIFICATE</p>
      <p className="head rank">OFFICIAL RECORDED RANK #{rank ?? "—"}</p>
      <p className="muted-text">PROVISIONAL RANK AT TIME OF CLAIM — FINAL STANDINGS CONFIRMED BY ORGANISERS.</p>
      <dl>
        <dt>TEAM</dt>
        <dd>{claim.teamCallsign}</dd>
        <dt>COMPLETED</dt>
        <dd>{when} (EAT)</dd>
        <dt>RAW TIME</dt>
        <dd>{fmtClock(claim.rawTime)}</dd>
        <dt>PENALTY</dt>
        <dd>+{fmtPenalty(claim.penaltyTime)}</dd>
        <dt>ADJUSTED</dt>
        <dd>{fmtClock(claim.totalScoreTime)}</dd>
        <dt>PARTNER 1</dt>
        <dd>
          {claim.partner1Name} ({claim.partner1Adm})
        </dd>
        <dt>PARTNER 2</dt>
        <dd>
          {claim.partner2Name} ({claim.partner2Adm})
        </dd>
      </dl>
      <p className="banner" role="status">
        {banner}
      </p>
    </div>
  );
}

export default function Vault({ session, onClaimed, onSessionLost }: Props) {
  const [typed, setTyped] = useState(Boolean(session.claim));
  const lines = session.vault?.lines ?? [];

  return (
    <section className="screen" aria-live="polite">
      {typed ? (
        <div className="vault-lines">
          {lines.map((l) => (
            <p key={l} className="typed head">
              {l}
            </p>
          ))}
        </div>
      ) : (
        <Typewriter lines={lines} speed={28} linePause={350} className="vault-lines" onDone={() => setTyped(true)} />
      )}

      {typed && session.claim && (
        <Certificate claim={session.claim} rank={session.rank} banner={session.vault?.banner ?? ""} />
      )}
      {typed && !session.claim && <ClaimForm onClaimed={onClaimed} onSessionLost={onSessionLost} />}
    </section>
  );
}
