// Builds the team roster for an online event and prints the TEAMS env var value.
// Usage: node scripts/make-teams.mjs <team-names.txt> <roster.json>
//   team-names.txt  one registered team name per line (max 32 characters)
//   roster.json     written with a 6-digit access code per team; keep it OUTSIDE this repository.
// Re-running keeps the codes of teams already in roster.json, so issued codes never change.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const [namesFile, rosterFile] = process.argv.slice(2);
if (!namesFile || !rosterFile) {
  console.error("Usage: node scripts/make-teams.mjs <team-names.txt> <roster.json>");
  process.exit(1);
}

const key = (name) => name.trim().replace(/\s+/g, " ").toLowerCase();
const names = readFileSync(namesFile, "utf8")
  .split(/\r?\n/)
  .map((n) => n.trim().replace(/\s+/g, " "))
  .filter(Boolean);

const previous = existsSync(rosterFile) ? JSON.parse(readFileSync(rosterFile, "utf8")) : [];
const known = new Map(previous.map((t) => [key(t.callsign), t.code]));
const used = new Set(known.values());
const seen = new Set();

const roster = names.map((callsign) => {
  if (callsign.length > 32) throw new Error(`Team name over 32 characters: ${callsign}`);
  if (seen.has(key(callsign))) throw new Error(`Duplicate team name: ${callsign}`);
  seen.add(key(callsign));
  let code = known.get(key(callsign));
  while (!code || (used.has(code) && !known.has(key(callsign)))) {
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  }
  used.add(code);
  return { callsign, code };
});

writeFileSync(rosterFile, JSON.stringify(roster, null, 2) + "\n");
console.error(`${roster.length} teams written to ${rosterFile}\n`);
for (const t of roster) console.error(`${t.code}  ${t.callsign}`);
console.error("\nTEAMS env var value (stdout):");
process.stdout.write(Buffer.from(JSON.stringify(roster), "utf8").toString("base64") + "\n");
