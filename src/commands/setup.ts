import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { AGE_KEY_DIR, AGE_KEY_FILE } from "../lib/config.js";
import { ensureTools } from "../lib/sops.js";

const GITIGNORE_ENTRIES = [
  "# Decrypted env files (managed by smonoenv)",
  ".env.monorepo.local",
  ".env.monorepo.staging",
  ".env.monorepo.production",
];

function ensureGitignore(): void {
  const gitignorePath = ".gitignore";
  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf8")
    : "";

  const missing = GITIGNORE_ENTRIES.filter((entry) => {
    if (entry.startsWith("#")) return false;
    return !existing.split("\n").some((line) => line.trim() === entry);
  });

  if (missing.length === 0) {
    console.log(".gitignore: decrypted env files already ignored");
    return;
  }

  const block = "\n" + GITIGNORE_ENTRIES.join("\n") + "\n";

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, block.trimStart(), "utf8");
  } else {
    const trailing = existing.endsWith("\n") ? "" : "\n";
    appendFileSync(gitignorePath, trailing + block, "utf8");
  }

  console.log(".gitignore: added decrypted env file entries");
}

function createKey(): void {
  if (existsSync(AGE_KEY_FILE)) {
    console.error(`age key already exists at: ${AGE_KEY_FILE}`);
    console.error("Delete it first if you want to regenerate.");
    process.exit(1);
  }

  if (!existsSync(AGE_KEY_DIR)) {
    mkdirSync(AGE_KEY_DIR, { recursive: true });
  }

  execSync(`age-keygen -o "${AGE_KEY_FILE}"`, { stdio: "inherit" });
  console.log(`\nCreated age key at: ${AGE_KEY_FILE}`);
}

export interface SetupOptions {
  createKey: boolean;
}

export function setup(options: SetupOptions): void {
  console.log("Setting up SOPS + age...\n");
  ensureTools();

  if (options.createKey) {
    createKey();
  }

  if (!existsSync(AGE_KEY_DIR)) {
    mkdirSync(AGE_KEY_DIR, { recursive: true });
  }

  ensureGitignore();

  if (existsSync(AGE_KEY_FILE)) {
    console.log("\nage key exists at:", AGE_KEY_FILE);

    const keyContent = readFileSync(AGE_KEY_FILE, "utf8");
    const pubKeyMatch = keyContent.match(/public key: (age1[a-z0-9]+)/);
    if (pubKeyMatch) {
      console.log("   Public key:", pubKeyMatch[1]);
    }
    console.log("\nReady to use! Run: smonoenv local");
  } else {
    console.error("\nage key not found at:", AGE_KEY_FILE);
    console.error("Set the key before using smonoenv.");
    process.exit(1);
  }
}
