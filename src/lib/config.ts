import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const AGE_KEY_DIR = join(homedir(), ".config", "sops", "age");
export const AGE_KEY_FILE = join(AGE_KEY_DIR, "keys.txt");

export function getEnvFile(env: string, encrypted = false): string {
  const suffix = encrypted ? ".sops" : "";
  return `.env.monorepo.${env}${suffix}`;
}

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
