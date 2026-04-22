import {
  AgeKeyNotFoundError,
  describeKeySources,
  releaseAgeKey,
  resolveAgeKey,
  type AgeKeyHandle,
} from "../lib/age-key.js";
import { getEnvFile } from "../lib/config.js";
import {
  DecryptError,
  EncryptedFileMissingError,
  decryptToFile,
} from "../lib/decrypt-core.js";
import type { Env } from "../lib/types.js";

export function decrypt(env: Env): void {
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

  const encFile = getEnvFile(env, true);
  console.log(`Decrypting ${encFile}... (key: ${handle.source})`);

  try {
    const { plaintextPath } = decryptToFile(env, { env: handle.env });
    console.log(`Created ${plaintextPath}`);
  } catch (err) {
    if (err instanceof EncryptedFileMissingError) {
      console.error(`${err.encFile} not found`);
      console.error("\nThe encrypted file doesn't exist yet.");
      console.error("Create the plaintext file first, then encrypt:");
      console.error(`  # Create ${getEnvFile(env, false)} with required variables`);
      console.error(`  smonoenv encrypt ${env}`);
      process.exit(1);
    }
    if (err instanceof DecryptError) {
      console.error("Decryption failed");
      if (err.message) console.error(err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    releaseAgeKey(handle);
  }
}
