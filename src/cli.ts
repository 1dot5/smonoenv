#!/usr/bin/env node
import process from "node:process";
import { ENVS, type Env } from "./lib/types.js";
import { parseArgs } from "./lib/args.js";
import { setup } from "./commands/setup.js";
import { encrypt } from "./commands/encrypt.js";
import { decrypt } from "./commands/decrypt.js";
import { edit } from "./commands/edit.js";
import { SyncError, sync } from "./commands/sync.js";
import { local } from "./commands/local.js";
import { exportEnv, type ExportFormat } from "./commands/export.js";
import {
  PRINT_ENV_FORMATS,
  run,
  type PrintEnvFormat,
} from "./commands/run.js";

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
  export <file>      Export .env file in a specified format
  local              Decrypt + sync local environment (shortcut)
  run <env> -- <cmd> [args...]
                     Decrypt + sync, then exec <cmd> (container entrypoint)
  help               Show this help

Setup options:
  --create-key       Generate a new age key
  --project          Use project-local .smonoenv/ (instead of ~/.config/sops/age/)
  --env <env>        Scope the age key to a specific env (.smonoenv/keys.<env>.txt)

Sync options:
  --check            Check if files are in sync (exit 1 if drift)
  --dry              Dry run, show what would change
  --clean            Delete target .env files before syncing
  --quiet            Suppress informational output

Export options:
  --format <fmt>     Output format: key-value (default: key-value)

Run options:
  --app <path>       Only sync this app path (repeatable)
  --clean            Delete target .env files before syncing
  --keep-artifacts   Keep decrypted plaintext + age key tmpfile (debug only)
  --no-sync          Decrypt only (useful with --print-env)
  --print-env        Print env to stdout instead of exec
  --format <fmt>     --print-env format: dotenv (default) | shell | json
  --quiet            Suppress informational output

Environments:
  local, staging, production

Examples:
  smonoenv setup                    # First-time setup (legacy global key)
  smonoenv setup --create-key       # Generate a new age key at the default path
  smonoenv setup --project --create-key
                                    # Generate .smonoenv/keys.txt (project-local)
  smonoenv setup --project --env production --create-key
                                    # Generate .smonoenv/keys.production.txt (env-scoped)
  smonoenv local                    # Setup local dev environment
  smonoenv decrypt staging          # Decrypt staging secrets
  smonoenv encrypt production       # Encrypt production secrets
  smonoenv sync --check             # CI: verify env files are in sync
  smonoenv export --format key-value .env  # Output as KEY=val,KEY2=val2
  smonoenv run production -- node dist/main.js
                                    # Container entrypoint: decrypt+sync+exec
  smonoenv run staging --print-env --format shell
                                    # eval "$(...)" to load into shell
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

function handleSyncError(err: unknown): never | void {
  if (err instanceof SyncError) {
    console.error(err.message);
    process.exit(err.exitCode);
  }
  throw err;
}

const { command, positional, flags, flagValues, flagMultiValues, passthrough } =
  parseArgs(process.argv);

switch (command) {
  case "setup": {
    const setupEnvFlag = flagValues.get("--env");
    setup({
      createKey: flags.has("--create-key"),
      project: flags.has("--project"),
      env: setupEnvFlag
        ? (ENVS as readonly string[]).includes(setupEnvFlag)
          ? (setupEnvFlag as Env)
          : (() => {
              console.error(`Invalid --env value: ${setupEnvFlag}`);
              console.error(`   Valid: ${ENVS.join(", ")}`);
              process.exit(1);
            })()
        : undefined,
    });
    break;
  }

  case "encrypt":
    encrypt(validateEnv(positional[0]));
    break;

  case "decrypt":
    decrypt(validateEnv(positional[0]));
    break;

  case "edit":
    edit(validateEnv(positional[0]));
    break;

  case "sync": {
    const env = positional[0] ? validateEnv(positional[0]) : ("local" as Env);
    try {
      sync({
        env,
        check: flags.has("--check"),
        dry: flags.has("--dry"),
        clean: flags.has("--clean"),
        quiet: flags.has("--quiet"),
      });
    } catch (err) {
      handleSyncError(err);
    }
    break;
  }

  case "export": {
    const formatFlag = flagValues.get("--format") ?? "key-value";
    const exportFile = positional[0];
    if (!exportFile) {
      console.error("Usage: smonoenv export <file> [--format key-value]");
      process.exit(1);
    }
    exportEnv(exportFile, formatFlag as ExportFormat);
    break;
  }

  case "local":
    local();
    break;

  case "run": {
    const envArg = validateEnv(positional[0]);
    const formatStr = flagValues.get("--format");
    const printFormat: PrintEnvFormat = (PRINT_ENV_FORMATS as readonly string[]).includes(
      formatStr ?? "",
    )
      ? (formatStr as PrintEnvFormat)
      : "dotenv";

    run(
      envArg,
      {
        apps: flagMultiValues.get("--app"),
        clean: flags.has("--clean"),
        keepArtifacts: flags.has("--keep-artifacts"),
        noSync: flags.has("--no-sync"),
        printEnv: flags.has("--print-env"),
        printFormat,
        quiet: flags.has("--quiet"),
      },
      passthrough,
    ).then(
      (code) => process.exit(code),
      (err) => {
        console.error(err);
        process.exit(1);
      },
    );
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
