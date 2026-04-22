import { existsSync } from "node:fs";
import {
  AgeKeyNotFoundError,
  describeKeySources,
  releaseAgeKey,
  resolveAgeKey,
  type AgeKeyHandle,
} from "../lib/age-key.js";
import { getEnvFile } from "../lib/config.js";
import { ensureTools, runSops } from "../lib/sops.js";
import type { Env } from "../lib/types.js";

export function edit(env: Env): void {
  ensureTools();
  const encFile = getEnvFile(env, true);

  if (!existsSync(encFile)) {
    console.error(`${encFile} not found`);
    process.exit(1);
  }

  let handle: AgeKeyHandle;
  try {
    handle = resolveAgeKey(process.env, { env });
  } catch (err) {
    if (err instanceof AgeKeyNotFoundError) {
      console.error("age key not found");
      console.error("\nProvide the age key via one of:");
      for (const line of describeKeySources(env)) console.error(line);
      process.exit(2);
    }
    throw err;
  }

  console.log(`Editing ${encFile}... (key: ${handle.source})`);

  try {
    const result = runSops(
      ["--input-type", "dotenv", "--output-type", "dotenv", encFile],
      handle.env,
    );

    if (result.status !== 0) {
      process.exit(result.status);
    }
  } finally {
    releaseAgeKey(handle);
  }
}
