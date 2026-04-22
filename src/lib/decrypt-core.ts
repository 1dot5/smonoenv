import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { getEnvFile } from "./config.js";
import { ensureSops } from "./sops.js";
import type { Env } from "./types.js";

export interface DecryptOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface DecryptResult {
  plaintextPath: string;
}

export class DecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptError";
  }
}

export class EncryptedFileMissingError extends DecryptError {
  readonly encFile: string;
  readonly env: Env;
  constructor(env: Env, encFile: string) {
    super(`${encFile} not found`);
    this.name = "EncryptedFileMissingError";
    this.env = env;
    this.encFile = encFile;
  }
}

export function decryptToString(env: Env, opts: DecryptOptions = {}): string {
  ensureSops();
  const encFile = getEnvFile(env, true);
  if (!existsSync(encFile)) {
    throw new EncryptedFileMissingError(env, encFile);
  }

  const result = spawnSync(
    "sops",
    ["--input-type", "dotenv", "--output-type", "dotenv", "--decrypt", encFile],
    {
      encoding: "utf8",
      env: opts.env ?? process.env,
      cwd: opts.cwd,
    },
  );

  if (result.error) {
    throw new DecryptError(`failed to invoke sops: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").trim();
    throw new DecryptError(
      `sops decrypt failed (status ${result.status})${stderr ? `: ${stderr}` : ""}`,
    );
  }
  return result.stdout ?? "";
}

export function decryptToFile(
  env: Env,
  opts: DecryptOptions = {},
): DecryptResult {
  const plaintext = decryptToString(env, opts);
  const plaintextPath = getEnvFile(env, false);
  writeFileSync(plaintextPath, plaintext, "utf8");
  return { plaintextPath };
}
