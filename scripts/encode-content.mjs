// Prints a game-content JSON file as the base64 value for the GAME_CONTENT env var.
// Usage: node scripts/encode-content.mjs path/to/game-content.json
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/encode-content.mjs <game-content.json>");
  process.exit(1);
}
const json = JSON.parse(readFileSync(file, "utf8"));
process.stdout.write(Buffer.from(JSON.stringify(json), "utf8").toString("base64"));
