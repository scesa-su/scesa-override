// Builds the team roster for an online event and prints the TEAMS env var value.
// Usage: node scripts/make-teams.mjs <team-names.txt> <roster.json>
//   team-names.txt  one team per line: "Team Name | Leader Full Name | Partner Full Name"
//                   (team name max 32 characters; members optional). Leave the partner out, or write
//                   "NEEDS A PARTNER", and that team plays solo.
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
const tidy = (s) => s.trim().replace(/\s+/g, " ");
const lines = readFileSync(namesFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.split("|").map(tidy))
  .filter(([name]) => name);

const previous = existsSync(rosterFile) ? JSON.parse(readFileSync(rosterFile, "utf8")) : [];
const known = new Map(previous.map((t) => [key(t.callsign), t.code]));
const used = new Set(known.values());
const seen = new Set();

const roster = lines.map(([callsign, ...rest]) => {
  const members = rest.filter((m) => m && m.toUpperCase() !== "NEEDS A PARTNER");
  if (callsign.length > 32) throw new Error(`Team name over 32 characters: ${callsign}`);
  if (seen.has(key(callsign))) throw new Error(`Duplicate team name: ${callsign}`);
  seen.add(key(callsign));
  let code = known.get(key(callsign));
  while (!code || (used.has(code) && !known.has(key(callsign)))) {
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  }
  used.add(code);
  return members.length ? { callsign, code, members } : { callsign, code };
});

writeFileSync(rosterFile, JSON.stringify(roster, null, 2) + "\n");
console.error(`${roster.length} teams written to ${rosterFile}\n`);
for (const t of roster) {
  const who = t.members ? `  ${t.members.join(" & ")}${t.members.length < 2 ? "  (SOLO)" : ""}` : "";
  console.error(`${t.code}  ${t.callsign}${who}`);
}
console.error("\nTEAMS env var value (stdout):");
process.stdout.write(Buffer.from(JSON.stringify(roster), "utf8").toString("base64") + "\n");
