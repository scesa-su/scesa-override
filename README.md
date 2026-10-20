# SCESA Sentinel Override

A retro green-screen terminal for an escape-room treasure hunt run by the **Strathmore Computing & Engineering Students Association (SCESA)**.

Teams solve a set of physical puzzles, assemble a six-part override sequence and enter it on the terminal. The fastest team, after hint penalties, wins.

> **No spoilers here.** This repository contains no puzzle answers, hints or story content. The real event content is loaded at runtime from an environment variable. The repo ships with a small demo puzzle so it runs out of the box.

## Features

- **1980s CRT look.** Phosphor-green text with CSS-only scanlines, vignette, flicker and a blinking cursor. Flicker and shake respect `prefers-reduced-motion`.
- **Synthesised sound.** Key clicks, error buzz, boot alarm and victory chime, all generated with the Web Audio API (no audio files), with a mute toggle.
- **Server-authoritative scoring.** The browser never sees the answer key or unrevealed hints. Start time, penalties and the final time are computed and frozen on the server. Changing the device clock, clearing storage or pausing JavaScript does not change a team's official time.
- **Progressive hints.** Each hint costs a time penalty. Hints for an artifact unlock in order, and each one is charged only once.
- **Brute-force protection.** After a wrong code, the server enforces a 3-second lockout before the next attempt.
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
    { "artifact": 0, "title": "…", "penaltySeconds": 0, "hints": ["…"] }   // vague → direct
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
| `ALLOW_MEMORY_STORE` | no | Set to `1` to allow a non-persistent in-memory store in production (not recommended). |

\* Set one of the two Redis pairs. Custom prefixes added by Vercel (for example `storage_KV_REST_API_URL`) are detected automatically. Without Redis, production returns errors on purpose, so that scores aren't silently lost. Check the configuration at `/api/health`.

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

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
