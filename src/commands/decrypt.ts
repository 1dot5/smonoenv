import { existsSync } from "node:fs";
import { getEnvFile, getSopsEnv, AGE_KEY_FILE } from "../lib/config.js";
import { ensureSops, runSopsShell } from "../lib/sops.js";
import type { Env } from "../lib/types.js";

export function decrypt(env: Env): void {
  ensureSops();
  const plainFile = getEnvFile(env, false);
  const encFile = getEnvFile(env, true);

  if (!existsSync(encFile)) {
    console.error(`${encFile} not found`);
    console.error("\nThe encrypted file doesn't exist yet.");
    console.error("Create the plaintext file first, then encrypt:");
    console.error(`  # Create ${plainFile} with required variables`);
    console.error(`  smonoenv encrypt ${env}`);
    process.exit(1);
  }

  console.log(`Decrypting ${encFile}...`);

  try {
    runSopsShell(
      `sops --input-type dotenv --output-type dotenv --decrypt "${encFile}" > "${plainFile}"`,
      getSopsEnv(),
    );
    console.log(`Created ${plainFile}`);
  } catch {
    console.error("Decryption failed");
    console.error("\nMake sure either:");
    console.error("  - SOPS_AGE_KEY env var is set, or");
    console.error("  - SOPS_AGE_KEY_FILE points to your key, or");
    console.error(`  - age key exists at: ${AGE_KEY_FILE}`);
    process.exit(1);
  }
}
