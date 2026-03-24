import { existsSync } from "node:fs";
import { getEnvFile, getSopsEnv } from "../lib/config.js";
import { ensureTools, runSopsShell } from "../lib/sops.js";
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

  console.log(`Encrypting ${plainFile}...`);

  try {
    runSopsShell(
      `sops --input-type dotenv --output-type dotenv --encrypt "${plainFile}" > "${encFile}"`,
      getSopsEnv(),
    );
    console.log(`Created ${encFile}`);
  } catch {
    console.error("Encryption failed");
    process.exit(1);
  }
}
