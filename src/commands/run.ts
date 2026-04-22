import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import {
  AgeKeyNotFoundError,
  describeKeySources,
  releaseAgeKey,
  resolveAgeKey,
  type AgeKeyHandle,
} from "../lib/age-key.js";
import {
  DecryptError,
  EncryptedFileMissingError,
  decryptToFile,
} from "../lib/decrypt-core.js";
import { parseEnvFile } from "../lib/parser.js";
import type { Env } from "../lib/types.js";
import { SyncError, sync } from "./sync.js";

export type PrintEnvFormat = "dotenv" | "shell" | "json";

export const PRINT_ENV_FORMATS: readonly PrintEnvFormat[] = [
  "dotenv",
  "shell",
  "json",
];

export interface RunOptions {
  apps?: string[];
  clean?: boolean;
  keepArtifacts?: boolean;
  noSync?: boolean;
  printEnv?: boolean;
  printFormat?: PrintEnvFormat;
  quiet?: boolean;
}

const FORWARDED_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

const SIGNAL_NUMBERS: Partial<Record<NodeJS.Signals, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGUSR2: 12,
  SIGTERM: 15,
};

export async function run(
  env: Env,
  opts: RunOptions,
  execArgs: string[],
): Promise<number> {
  let keyHandle: AgeKeyHandle;
  try {
    keyHandle = resolveAgeKey(process.env, { env });
  } catch (err) {
    if (err instanceof AgeKeyNotFoundError) {
      console.error("age key not found");
      console.error("\nProvide the age key via one of:");
      for (const line of describeKeySources(env)) console.error(line);
      return 2;
    }
    throw err;
  }

  let plaintextPath: string | undefined;
  let ageKeyReleased = false;

  const cleanupPlaintext = () => {
    if (!plaintextPath) return;
    if (!opts.keepArtifacts && existsSync(plaintextPath)) {
      try {
        unlinkSync(plaintextPath);
      } catch {
        // best-effort
      }
    }
    plaintextPath = undefined;
  };

  const cleanupAgeKey = () => {
    if (ageKeyReleased) return;
    if (!opts.keepArtifacts) {
      releaseAgeKey(keyHandle);
    }
    ageKeyReleased = true;
  };

  try {
    try {
      const result = decryptToFile(env, { env: keyHandle.env });
      plaintextPath = result.plaintextPath;
    } catch (err) {
      if (err instanceof EncryptedFileMissingError) {
        console.error(`${err.encFile} not found`);
        console.error(`\nEncrypt it first:  smonoenv encrypt ${env}`);
        return 1;
      }
      if (err instanceof DecryptError) {
        console.error("Decryption failed");
        if (err.message) console.error(err.message);
        return 1;
      }
      throw err;
    }

    if (!opts.noSync) {
      try {
        sync({
          env,
          check: false,
          dry: false,
          clean: opts.clean ?? false,
          quiet: opts.quiet ?? true,
          apps: opts.apps,
        });
      } catch (err) {
        if (err instanceof SyncError) {
          console.error(err.message);
          return err.exitCode;
        }
        throw err;
      }
    }

    if (opts.printEnv) {
      if (!plaintextPath) return 1;
      const format = opts.printFormat ?? "dotenv";
      process.stdout.write(formatEnvFile(plaintextPath, format));
      return 0;
    }

    if (execArgs.length === 0) {
      return 0;
    }

    // Minimize secret lifetime: clear plaintext artifacts BEFORE we hand the
    // process over to the child command. sops has already materialized the
    // values into the .env files that sync wrote.
    cleanupPlaintext();
    cleanupAgeKey();

    return await execInheritAndForward(execArgs);
  } finally {
    cleanupPlaintext();
    cleanupAgeKey();
  }
}

export function formatEnvVars(
  vars: Array<{ key: string; value: string }>,
  format: PrintEnvFormat,
): string {
  switch (format) {
    case "dotenv":
      return vars.map(({ key, value }) => `${key}=${value}`).join("\n") + "\n";
    case "shell":
      return (
        vars
          .map(({ key, value }) => `export ${key}=${shellSingleQuote(value)}`)
          .join("\n") + "\n"
      );
    case "json":
      return (
        JSON.stringify(
          Object.fromEntries(vars.map((v) => [v.key, v.value])),
          null,
          2,
        ) + "\n"
      );
  }
}

function formatEnvFile(path: string, format: PrintEnvFormat): string {
  return formatEnvVars(parseEnvFile(path), format);
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function execInheritAndForward(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const [cmd, ...rest] = args;
    const child = spawn(cmd, rest, { stdio: "inherit" });

    const handlers = new Map<NodeJS.Signals, () => void>();
    for (const sig of FORWARDED_SIGNALS) {
      const handler = () => {
        if (!child.killed) {
          try {
            child.kill(sig);
          } catch {
            // ignore
          }
        }
      };
      handlers.set(sig, handler);
      process.on(sig, handler);
    }
    const cleanup = () => {
      for (const [sig, h] of handlers) process.off(sig, h);
      handlers.clear();
    };

    child.on("error", (err: NodeJS.ErrnoException) => {
      cleanup();
      if (err.code === "ENOENT") {
        console.error(`smonoenv run: command not found: ${cmd}`);
        resolve(127);
        return;
      }
      reject(err);
    });

    child.on("exit", (code, signal) => {
      cleanup();
      if (signal) {
        const num = SIGNAL_NUMBERS[signal] ?? 0;
        resolve(128 + num);
        return;
      }
      resolve(code ?? 1);
    });
  });
}
