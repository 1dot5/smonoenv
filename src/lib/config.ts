import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const AGE_KEY_DIR = join(homedir(), ".config", "sops", "age");
export const AGE_KEY_FILE = join(AGE_KEY_DIR, "keys.txt");
export const PROJECT_DIR_NAME = ".smonoenv";

export function findProjectDir(cwd: string): string | null {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, PROJECT_DIR_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function getEnvFile(env: string, encrypted = false): string {
  const suffix = encrypted ? ".sops" : "";
  return `.env.monorepo.${env}${suffix}`;
}

/**
 * Legacy sync helper. Prefer `resolveAgeKey` + `releaseAgeKey` from `age-key.ts`
 * so tmpfiles (materialized from inline SOPS_AGE_KEY) are cleaned up.
 *
 * This wrapper does NOT support env- or project-scoped resolution. Use it only
 * when retrofitting old code paths that cannot thread an env argument.
 */
export function getSopsEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (existsSync(AGE_KEY_FILE)) {
    env.SOPS_AGE_KEY_FILE = AGE_KEY_FILE;
  }
  return env;
}

export function getMonoFile(env: string, cwd: string): string {
  const newName = join(cwd, `.env.monorepo.${env}`);
  const oldName = join(cwd, ".env.monorepo");

  if (existsSync(newName)) return newName;
  if (env === "local" && existsSync(oldName)) return oldName;
  return newName;
}

export function targetFile(sectionPath: string, cwd: string): string {
  if (sectionPath.includes(":")) {
    const [p, env] = sectionPath.split(":");
    return join(cwd, p, `.env.${env.replace(/^\./, "")}`);
  }
  return join(cwd, sectionPath, ".env");
}
