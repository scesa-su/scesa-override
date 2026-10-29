# SCESA Sentinel Override

A retro green-screen terminal for an escape-room treasure hunt run by the **Strathmore Computing & Engineering Students Association (SCESA)**.

Teams solve a set of physical puzzles, assemble a six-part override sequence and enter it on the terminal. The fastest team, after hint penalties, wins.

> **No spoilers here.** This repository contains no puzzle answers, hints or story content. The real event content is loaded at runtime from an environment variable. The repo ships with a small demo puzzle so it runs out of the box.

## Features

- **1980s CRT look.** Phosphor-green text with CSS-only scanlines, vignette, flicker and a blinking cursor. Flicker and shake respect `prefers-reduced-motion`.
- **Synthesised audio.** A looping chiptune soundtrack plus sound effects: typing clicks, error buzz, boot alarm, hint decrypt, unlock ping and victory chime. Everything is generated with the Web Audio API (no audio files). Music and SFX have separate switches; music starts off.
- **Mission briefing.** A popup that opens when a team first reaches the console, and can be reopened any time.
- **Server-authoritative scoring.** The browser never sees the answer key or unrevealed hints. Start time, penalties and the final time are computed and frozen on the server. Changing the device clock, clearing storage or pausing JavaScript does not change a team's official time.
- **Progressive hints.** Hints for an artifact unlock in order and are charged once. Penalties can escalate from a cheap nudge to an expensive direct hint, and a hint group can stay locked until a set time after the team starts.
- **Brute-force protection.** After a wrong code, the server enforces a lockout before the next attempt: 3 seconds for the first 5 misses, 30 seconds up to 10, then 2 minutes.
- **Online events.** Optional shared start and end times, a roster of registered teams with access codes, and a case-file download link. The leaderboard flags teams that finish within 3 minutes of each other.
- **Session resume.** Each team gets a resume code. The same call-sign can only be reused with the original browser or that code, and repeated wrong resume codes are locked out.
- **Winner claims and leaderboard.** Teams register both members after solving. Organisers see a live, secret-protected leaderboard.
- **Mobile-first.** Works on phones down to 360px wide.

## Tech stack

Next.js (App Router) · React · TypeScript · Upstash Redis · Vitest · deployed on Vercel.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

With no configuration, the app runs the **demo puzzle** from [`content/game.example.json`](content/game.example.json) and keeps state in memory. The demo code is shown in its free hint.

```bash
npm test           # unit + API route tests
npm run lint
npx tsc --noEmit
npm run build
```

## Game content

All puzzle-specific text lives in one JSON document with this shape (see the demo file for a full example):

```jsonc
{
  "codes": ["123", "456", "789", "246", "135", "864"],   // six 3-digit parts, in slot order
  "hints": [
    {
      "artifact": 0,
      "title": "…",
      "unlockAfterSeconds": 600,      // optional: locked until 10 min after start
      "penalties": [0],               // one penalty (seconds) per hint
      "hints": ["…"]                  // vague → direct
    }
  ],
  "vault": {
    "lines": ["…"],                 // shown after a correct override
    "winnerBanner": "…",            // certificate banner for rank 1
    "rankBanner": "… #{rank}."      // certificate banner for other ranks
  }
}
```

The app loads content from the first source that is set:

1. `GAME_CONTENT`: the JSON, base64-encoded. **Use this in production.**
2. `GAME_CONTENT_FILE`: a path to a JSON file, for local testing with real content.
3. `content/game.example.json`: the demo puzzle. It is used outside production only; production refuses to start without real content.

To produce the `GAME_CONTENT` value from a file kept **outside** this repository:

```bash
npm run content:encode -- /path/to/game-content.json
```

## Environment variables

Copy [`.env.example`](.env.example) to `.env.local` for local overrides.

| Name | Required in production | Purpose |
|---|---|---|
| `GAME_CONTENT` | yes | Base64 game content (see above). |
| `SESSION_SECRET` | yes | Long random string used to sign session cookies. |
| `LEADERBOARD_SECRET` | yes | Unlocks the organiser leaderboard. If unset, the leaderboard stays locked. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | yes* | Set automatically when you connect Upstash Redis through Vercel. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | yes* | Use these instead if you connect an Upstash database directly. |
| `EVENT_START` | no | ISO time (with offset) every team's clock starts from. Nobody can start before it. |
| `EVENT_END` | no | ISO time after which codes and hints are refused and no new team can start. |
| `TEAMS` | no | Base64 roster of registered teams. When set, only those teams can play, each with its access code. |
| `TEAMS_FILE` | no | Path to a roster JSON, for local testing. |
| `CASE_FILE_URL` | no | Case-file download link shown to teams once they are in. |
| `ALLOW_MEMORY_STORE` | no | Set to `1` to allow a non-persistent in-memory store in production (not recommended). |

\* Set one of the two Redis pairs. Custom prefixes added by Vercel (for example `storage_KV_REST_API_URL`) are detected automatically. Without Redis, production returns errors on purpose, so that scores aren't silently lost. Check the configuration at `/api/health`.

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Running an online event

1. List the teams in a text file kept **outside** this repository, one per line: `Team Name | Leader Full Name | Partner Full Name`. Write `NEEDS A PARTNER` (or leave the partner out) for a team without one: it plays solo, and its claim form leaves Partner 2 blank.
2. Run `npm run teams:make -- /path/to/team-names.txt /path/to/roster.json`. It prints each team's 6-digit access code and, on stdout, the `TEAMS` value. Re-running keeps existing codes.
3. Set `TEAMS`, `EVENT_START`, `EVENT_END` and `CASE_FILE_URL` in Vercel, then redeploy.

Before `EVENT_START` the portal shows a countdown. Every session's clock counts from `EVENT_START`, so joining late costs time, and timed hint groups unlock relative to it. A team's access code also works as its resume code, so both partners can log in on their own devices.

## Deploying to Vercel

1. Import this repository as a new Vercel project. The Next.js defaults are fine.
2. Under **Storage**, connect **Upstash for Redis** to the project.
3. Under **Settings → Environment Variables**, add `GAME_CONTENT`, `SESSION_SECRET` and `LEADERBOARD_SECRET`.
4. Redeploy, then smoke-test: start a session, reveal a hint, enter a wrong code (expect the lockout), enter the correct code, submit a claim and open the leaderboard.

## API overview

All responses are `Cache-Control: no-store`. Session routes need the signed session cookie set by `start`.

| Route | Purpose |
|---|---|
| `POST /api/session/start` | Start or resume a team session `{ callsign, resumeCode? }`. |
| `GET /api/session` | Current session state, used to restore the screen on reload. |
| `GET /api/event` | Public event schedule and whether entry needs a team code. |
| `POST /api/hint` | Reveal the next hint for an artifact `{ artifact, index }`. Each hint is charged once. |
| `POST /api/verify` | Check the six-part code `{ parts }` or `{ code }`. A wrong code triggers a 3-second lockout. |
| `POST /api/claim` | Register the winning pair after solving. |
| `GET /api/leaderboard?secret=…` | Organiser leaderboard, as JSON or an auto-refreshing HTML table. |

**Official time** = whole seconds from session start to the first correct code, plus hint penalties. Ties go to whoever finished first.

## Project structure

```
app/            pages and API routes
components/     terminal UI (standby, console, hints, vault)
lib/audio.ts    Web Audio sound effects
lib/server/     server-only logic: content, sessions, scoring, storage
content/        demo puzzle content
tests/          Vitest unit and route tests
```

## Credits

Built for SCESA by the SCESA executive board.
