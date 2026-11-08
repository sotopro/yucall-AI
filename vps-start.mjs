// Entry point of the VPS image: loads the secrets rendered by the OpenBao Agent into the
// environment, then starts Next's standalone server.
import { readFileSync } from "node:fs";

if (process.env.SECRETS_FILE) {
  Object.assign(process.env, JSON.parse(readFileSync(process.env.SECRETS_FILE, "utf8")));
}

await import("./server.js");
