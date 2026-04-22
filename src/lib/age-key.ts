import {
  chmodSync,
  existsSync,
  mkdtempSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGE_KEY_FILE, findProjectDir } from "./config.js";

export type AgeKeySource =
  | "env-value"
  | "env-file"
  | "env-value-scoped"
  | "env-file-scoped"
  | "project-file"
  | "project-file-scoped"
  | "default-path";

export interface AgeKeyHandle {
  env: NodeJS.ProcessEnv;
  source: AgeKeySource;
  /** Absolute path to the age key file that will be consumed by sops. */
  keyPath: string;
  /** Present when the handle materialized an inline value; remove on release. */
  tmpFile?: string;
  /** The env / cwd values used for resolution, for diagnostics. */
  resolvedFor: { env?: string; cwd: string };
}

export interface ResolveAgeKeyOptions {
  /** Scope the resolution to a specific environment (e.g. "production"). */
  env?: string;
  /** Working directory used to locate `.smonoenv/` (defaults to process.cwd()). */
  cwd?: string;
  /** Override the default (legacy) key path. Mainly for tests. */
  defaultKeyPath?: string;
}

export class AgeKeyNotFoundError extends Error {
  readonly checked: string[];
  constructor(checked: string[]) {
    super(
      `age key not found (checked: ${checked.join(", ")})`,
    );
    this.name = "AgeKeyNotFoundError";
    this.checked = checked;
  }
}

function materializeInline(
  inline: string,
  baseEnv: NodeJS.ProcessEnv,
  source: AgeKeySource,
  resolvedFor: { env?: string; cwd: string },
): AgeKeyHandle {
  const dir = mkdtempSync(join(tmpdir(), "smonoenv-age-"));
  const tmpFile = join(dir, "keys.txt");
  const payload = inline.endsWith("\n") ? inline : inline + "\n";
  writeFileSync(tmpFile, payload, { mode: 0o600 });
  try {
    chmodSync(tmpFile, 0o600);
  } catch {
    // best-effort on non-POSIX
  }
  const env = { ...baseEnv };
  env.SOPS_AGE_KEY_FILE = tmpFile;
  delete env.SOPS_AGE_KEY;
  return { env, source, keyPath: tmpFile, tmpFile, resolvedFor };
}

function pointToFile(
  path: string,
  baseEnv: NodeJS.ProcessEnv,
  source: AgeKeySource,
  resolvedFor: { env?: string; cwd: string },
): AgeKeyHandle {
  const env = { ...baseEnv };
  env.SOPS_AGE_KEY_FILE = path;
  delete env.SOPS_AGE_KEY;
  return { env, source, keyPath: path, resolvedFor };
}

export function resolveAgeKey(
  baseEnv: NodeJS.ProcessEnv = process.env,
  opts: ResolveAgeKeyOptions = {},
): AgeKeyHandle {
  const defaultKeyPath = opts.defaultKeyPath ?? AGE_KEY_FILE;
  const cwd = opts.cwd ?? process.cwd();
  const targetEnv = opts.env;
  const up = targetEnv ? targetEnv.toUpperCase() : null;
  const resolvedFor = { env: targetEnv, cwd };
  const checked: string[] = [];

  if (up) {
    const varName = `SOPS_AGE_KEY_${up}`;
    checked.push(varName);
    const inlineScoped = baseEnv[varName]?.trim();
    if (inlineScoped && inlineScoped.length > 0) {
      return materializeInline(inlineScoped, baseEnv, "env-value-scoped", resolvedFor);
    }

    const fileVarName = `SOPS_AGE_KEY_FILE_${up}`;
    checked.push(fileVarName);
    const scopedFile = baseEnv[fileVarName];
    if (scopedFile && existsSync(scopedFile)) {
      return pointToFile(scopedFile, baseEnv, "env-file-scoped", resolvedFor);
    }
  }

  const projectDir = findProjectDir(cwd);
  if (projectDir) {
    if (targetEnv) {
      const scopedProjectFile = join(projectDir, `keys.${targetEnv}.txt`);
      checked.push(scopedProjectFile);
      if (existsSync(scopedProjectFile)) {
        return pointToFile(
          scopedProjectFile,
          baseEnv,
          "project-file-scoped",
          resolvedFor,
        );
      }
    }
    const commonProjectFile = join(projectDir, "keys.txt");
    checked.push(commonProjectFile);
    if (existsSync(commonProjectFile)) {
      return pointToFile(commonProjectFile, baseEnv, "project-file", resolvedFor);
    }
  }

  checked.push("SOPS_AGE_KEY");
  const inline = baseEnv.SOPS_AGE_KEY?.trim();
  if (inline && inline.length > 0) {
    return materializeInline(inline, baseEnv, "env-value", resolvedFor);
  }

  checked.push("SOPS_AGE_KEY_FILE");
  const envFile = baseEnv.SOPS_AGE_KEY_FILE;
  if (envFile && existsSync(envFile)) {
    return pointToFile(envFile, baseEnv, "env-file", resolvedFor);
  }

  checked.push(defaultKeyPath);
  if (existsSync(defaultKeyPath)) {
    return pointToFile(defaultKeyPath, baseEnv, "default-path", resolvedFor);
  }

  throw new AgeKeyNotFoundError(checked);
}

export function releaseAgeKey(handle: AgeKeyHandle): void {
  if (!handle.tmpFile) return;
  try {
    unlinkSync(handle.tmpFile);
  } catch {
    // already gone or locked; swallow
  }
  handle.tmpFile = undefined;
}

export function describeKeySources(env: string | undefined): string[] {
  const lines: string[] = [];
  if (env) {
    const up = env.toUpperCase();
    lines.push(`  - SOPS_AGE_KEY_${up} / SOPS_AGE_KEY_FILE_${up} (env-scoped)`);
    lines.push(`  - .smonoenv/keys.${env}.txt (project, env-scoped)`);
  }
  lines.push(`  - .smonoenv/keys.txt (project, common)`);
  lines.push(`  - SOPS_AGE_KEY / SOPS_AGE_KEY_FILE (process env)`);
  lines.push(`  - ${AGE_KEY_FILE} (global legacy default)`);
  return lines;
}
