import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { dirname } from "node:path";
import { getMonoFile, targetFile } from "../lib/config.js";
import { parseMono, normalize } from "../lib/parser.js";
import type { Env, SyncOptions, SyncResult } from "../lib/types.js";

export function sync(options: SyncOptions): SyncResult {
  const { env, check: modeCheck, dry: modeDry, clean: modeClean, quiet } = options;
  const cwd = process.cwd();
  const MONO_FILE = getMonoFile(env, cwd);

  if (!quiet) {
    console.log(`Reading ${MONO_FILE}...`);
  }

  if (!existsSync(MONO_FILE)) {
    console.error(`Missing ${MONO_FILE}`);
    console.error("\nDecrypt from SOPS:");
    console.error(`  smonoenv decrypt ${env}`);
    console.error("\nOr create manually.");
    process.exit(2);
  }

  const mono = readFileSync(MONO_FILE, "utf8");
  const sections = parseMono(mono);

  if (modeClean) {
    if (!quiet) console.log("Cleaning existing .env files...");
    let deleted = 0;
    for (const s of sections) {
      const dest = targetFile(s.path, cwd);
      if (existsSync(dest)) {
        if (modeDry) {
          console.log(`   ~ Would delete: ${dest}`);
        } else {
          unlinkSync(dest);
          console.log(`   - ${dest}`);
          deleted++;
        }
      }
    }
    if (!quiet && !modeDry) {
      console.log(`   Deleted ${deleted} file(s)\n`);
    }
  }

  let changed = 0;
  let created = 0;
  let skipped = 0;

  for (const s of sections) {
    const dest = targetFile(s.path, cwd);
    const body = normalize(s.body.join("\n"));

    if (!existsSync(dirname(dest))) {
      mkdirSync(dirname(dest), { recursive: true });
    }

    const prev = existsSync(dest) ? readFileSync(dest, "utf8") : null;
    const same = prev !== null && normalize(prev) === body;

    if (same) {
      skipped++;
      if (!quiet) console.log(`   ok ${dest}`);
      continue;
    }

    if (modeCheck) {
      console.log(`   Drift: ${dest}`);
      changed++;
      continue;
    }

    if (modeDry) {
      console.log(`   ~ Would write: ${dest}`);
      continue;
    }

    writeFileSync(dest, body, "utf8");
    if (prev === null) {
      created++;
      console.log(`   + ${dest}`);
    } else {
      changed++;
      console.log(`   ~ ${dest}`);
    }
  }

  if (!quiet) console.log("");

  if (modeCheck) {
    if (changed > 0) {
      console.error(
        `Found ${changed} out-of-sync file(s). Run: smonoenv sync ${env}`,
      );
      process.exit(1);
    } else if (!quiet) {
      console.log("All env files are in sync.");
    }
  } else if (!quiet) {
    console.log(
      `Sync complete. created=${created}, updated=${changed}, skipped=${skipped}`,
    );
  }

  return { created, updated: changed, skipped, drifted: changed };
}
