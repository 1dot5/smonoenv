import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  AgeKeyNotFoundError,
  describeKeySources,
  releaseAgeKey,
  resolveAgeKey,
  type AgeKeyHandle,
} from "../lib/age-key.js";
import { getEnvFile } from "../lib/config.js";
import { ensureTools } from "../lib/sops.js";
import type { Env } from "../lib/types.js";

export function encrypt(env: Env): void {
  ensureTools();
  const plainFile = getEnvFile(env, false);
  const encFile = getEnvFile(env, true);

  if (!existsSync(plainFile)) {
    console.error(`${plainFile} not found`);
    console.error("\nCreate it first by copying from another environment or creating manually.");
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

  console.log(`Encrypting ${plainFile}... (key: ${handle.source})`);

  try {
    const result = spawnSync(
      "sops",
      [
        "--input-type",
        "dotenv",
        "--output-type",
        "dotenv",
        "--encrypt",
        plainFile,
      ],
      { encoding: "utf8", env: handle.env },
    );

    if (result.error) {
      console.error(`Encryption failed: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      const stderr = (result.stderr ?? "").trim();
      console.error(`Encryption failed (status ${result.status})`);
      if (stderr) console.error(stderr);
      process.exit(result.status ?? 1);
    }

    writeFileSync(encFile, result.stdout ?? "", { encoding: "utf8", mode: 0o600 });
    console.log(`Created ${encFile}`);
  } finally {
    releaseAgeKey(handle);
  }
}
