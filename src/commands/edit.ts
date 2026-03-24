import { existsSync } from "node:fs";
import { getEnvFile, getSopsEnv } from "../lib/config.js";
import { ensureTools, runSops } from "../lib/sops.js";
import type { Env } from "../lib/types.js";

export function edit(env: Env): void {
  ensureTools();
  const encFile = getEnvFile(env, true);

  if (!existsSync(encFile)) {
    console.error(`${encFile} not found`);
    process.exit(1);
  }

  console.log(`Editing ${encFile}...`);

  const result = runSops(
    ["--input-type", "dotenv", "--output-type", "dotenv", encFile],
    getSopsEnv(),
  );

  if (result.status !== 0) {
    process.exit(result.status);
  }
}
