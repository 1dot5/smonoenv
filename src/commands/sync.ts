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
import type { MonoSection, SyncOptions, SyncResult } from "../lib/types.js";

export class SyncError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "SyncError";
    this.exitCode = exitCode;
  }
}

function stripTrailingSlash(p: string): string {
  return p.replace(/\/+$/, "");
}

function filterByApps(
  sections: MonoSection[],
  apps: string[] | undefined,
): MonoSection[] {
  if (!apps || apps.length === 0) return sections;
  const wanted = new Set(apps.map(stripTrailingSlash));
  return sections.filter((s) => {
    const basePath = stripTrailingSlash(s.path.split(":")[0]);
    return wanted.has(basePath);
  });
}

export function sync(options: SyncOptions): SyncResult {
  const {
    env,
    check: modeCheck,
    dry: modeDry,
    clean: modeClean,
    quiet,
    apps,
  } = options;
  const cwd = process.cwd();
  const MONO_FILE = getMonoFile(env, cwd);

  if (!quiet) {
    console.log(`Reading ${MONO_FILE}...`);
  }

  if (!existsSync(MONO_FILE)) {
    throw new SyncError(
      `Missing ${MONO_FILE}\n\nDecrypt from SOPS:\n  smonoenv decrypt ${env}\n\nOr create manually.`,
      2,
    );
  }

  const mono = readFileSync(MONO_FILE, "utf8");
  const sections = filterByApps(parseMono(mono), apps);

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
      throw new SyncError(
        `Found ${changed} out-of-sync file(s). Run: smonoenv sync ${env}`,
        1,
      );
    }
    if (!quiet) {
      console.log("All env files are in sync.");
    }
  } else if (!quiet) {
    console.log(
      `Sync complete. created=${created}, updated=${changed}, skipped=${skipped}`,
    );
  }

  return { created, updated: changed, skipped, drifted: changed };
}
