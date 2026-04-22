import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import {
  AGE_KEY_DIR,
  AGE_KEY_FILE,
  PROJECT_DIR_NAME,
} from "../lib/config.js";
import { ensureTools } from "../lib/sops.js";
import { ENVS, type Env } from "../lib/types.js";

const MONO_GITIGNORE_ENTRIES = [
  "# Decrypted env files (managed by smonoenv)",
  ".env.monorepo.local",
  ".env.monorepo.staging",
  ".env.monorepo.production",
];

const PROJECT_GITIGNORE_ENTRIES = [
  "# Project-local age keys (managed by smonoenv)",
  ".smonoenv/keys.txt",
  ".smonoenv/keys.*.txt",
];

function addMissingEntries(
  gitignorePath: string,
  entries: string[],
  label: string,
): void {
  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";

  const present = new Set(
    existing.split("\n").map((l) => l.trim()),
  );
  const missing = entries.filter(
    (e) => !e.startsWith("#") && !present.has(e),
  );

  if (missing.length === 0) {
    console.log(`.gitignore: ${label} already covered`);
    return;
  }

  const block = "\n" + entries.join("\n") + "\n";
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, block.trimStart(), "utf8");
  } else {
    const trailing = existing.endsWith("\n") ? "" : "\n";
    appendFileSync(gitignorePath, trailing + block, "utf8");
  }
  console.log(`.gitignore: added ${label}`);
}

function ensureGitignore(project: boolean): void {
  const gitignorePath = ".gitignore";
  addMissingEntries(gitignorePath, MONO_GITIGNORE_ENTRIES, "decrypted env files");
  if (project) {
    addMissingEntries(
      gitignorePath,
      PROJECT_GITIGNORE_ENTRIES,
      "project-local age keys",
    );
  }
}

function keyTargetPath(opts: SetupOptions, cwd: string): string {
  if (opts.project) {
    const dir = join(cwd, PROJECT_DIR_NAME);
    return opts.env
      ? join(dir, `keys.${opts.env}.txt`)
      : join(dir, "keys.txt");
  }
  return AGE_KEY_FILE;
}

function createKeyAt(target: string): void {
  if (existsSync(target)) {
    console.error(`age key already exists at: ${target}`);
    console.error("Delete it first if you want to regenerate.");
    process.exit(1);
  }

  const dir = dirname(target);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  execSync(`age-keygen -o "${target}"`, { stdio: "inherit" });
  console.log(`\nCreated age key at: ${target}`);
}

export interface SetupOptions {
  createKey: boolean;
  /** Create/use `.smonoenv/` in cwd instead of the global `~/.config/sops/age/`. */
  project: boolean;
  /** Scope the key to a specific environment (e.g. `keys.production.txt`). */
  env?: Env;
}

export function setup(options: SetupOptions): void {
  if (options.env && !(ENVS as readonly string[]).includes(options.env)) {
    console.error(`Invalid --env value: ${options.env}`);
    console.error(`   Valid: ${ENVS.join(", ")}`);
    process.exit(1);
  }

  console.log("Setting up SOPS + age...\n");
  ensureTools();

  const cwd = process.cwd();
  const target = keyTargetPath(options, cwd);

  if (options.createKey) {
    createKeyAt(target);
  }

  if (options.project) {
    const projectDir = join(cwd, PROJECT_DIR_NAME);
    if (!existsSync(projectDir)) {
      mkdirSync(projectDir, { recursive: true });
      console.log(`Created project dir: ${projectDir}`);
    }
  } else if (!existsSync(AGE_KEY_DIR)) {
    mkdirSync(AGE_KEY_DIR, { recursive: true });
  }

  ensureGitignore(options.project);

  if (existsSync(target)) {
    console.log(`\nage key in use: ${target}`);

    const keyContent = readFileSync(target, "utf8");
    const pubKeyMatch = keyContent.match(/public key: (age1[a-z0-9]+)/);
    if (pubKeyMatch) {
      console.log(`   Public key: ${pubKeyMatch[1]}`);
    }
    if (options.env) {
      console.log(`   Scoped to env: ${options.env}`);
    }
    console.log("\nReady to use! Try: smonoenv local");
  } else {
    console.error(`\nage key not found at: ${target}`);
    if (options.project) {
      console.error(
        `Generate with: smonoenv setup --project${options.env ? ` --env ${options.env}` : ""} --create-key`,
      );
      console.error("Or drop a shared team key at that path.");
    } else {
      console.error("Set the key before using smonoenv.");
    }
    process.exit(1);
  }
}
