#!/usr/bin/env node
import process from "node:process";
import { ENVS, type Env } from "./lib/types.js";
import { setup } from "./commands/setup.js";
import { encrypt } from "./commands/encrypt.js";
import { decrypt } from "./commands/decrypt.js";
import { edit } from "./commands/edit.js";
import { sync } from "./commands/sync.js";
import { local } from "./commands/local.js";
import { cloudRun } from "./commands/cloud-run.js";

function usage(): void {
  console.log(`
smonoenv - SOPS + age Secret Management

Usage:
  smonoenv <command> [options]

Commands:
  setup              Setup SOPS + age (verify key, configure .gitignore)
  encrypt <env>      Encrypt .env.monorepo.<env> -> .env.monorepo.<env>.sops
  decrypt <env>      Decrypt .env.monorepo.<env>.sops -> .env.monorepo.<env>
  edit <env>         Edit encrypted file directly with $EDITOR
  sync [env]         Sync decrypted env to apps (default: local)
  local              Decrypt + sync local environment (shortcut)
  cloud-run <file>   Convert .env file to Cloud Run --set-env-vars format
  help               Show this help

Setup options:
  --create-key       Generate a new age key

Sync options:
  --check            Check if files are in sync (exit 1 if drift)
  --dry              Dry run, show what would change
  --clean            Delete target .env files before syncing
  --quiet            Suppress informational output

Environments:
  local, staging, production

Examples:
  smonoenv setup                    # First-time setup
  smonoenv setup --create-key       # Generate a new age key
  smonoenv local                    # Setup local dev environment
  smonoenv decrypt staging          # Decrypt staging secrets
  smonoenv encrypt production       # Encrypt production secrets
  smonoenv sync --check             # CI: verify env files are in sync
  smonoenv cloud-run .env           # Output Cloud Run format
`);
}

function validateEnv(env: string | undefined): Env {
  if (!env || !(ENVS as readonly string[]).includes(env)) {
    console.error(`Invalid environment: ${env}`);
    console.error(`   Valid: ${ENVS.join(", ")}`);
    process.exit(1);
  }
  return env as Env;
}

const args = process.argv.slice(2);
const command = args[0];

const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

switch (command) {
  case "setup":
    setup({ createKey: flags.has("--create-key") });
    break;

  case "encrypt":
    encrypt(validateEnv(positional[1]));
    break;

  case "decrypt":
    decrypt(validateEnv(positional[1]));
    break;

  case "edit":
    edit(validateEnv(positional[1]));
    break;

  case "sync": {
    const env = positional[1] ? validateEnv(positional[1]) : ("local" as Env);
    sync({
      env,
      check: flags.has("--check"),
      dry: flags.has("--dry"),
      clean: flags.has("--clean"),
      quiet: flags.has("--quiet"),
    });
    break;
  }

  case "local":
    local();
    break;

  case "cloud-run": {
    const file = positional[1];
    if (!file) {
      console.error("Usage: smonoenv cloud-run <env-file>");
      process.exit(1);
    }
    cloudRun(file);
    break;
  }

  case "help":
  case "--help":
  case "-h":
  case undefined:
    usage();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
}
