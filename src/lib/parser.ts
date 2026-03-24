import { readFileSync, existsSync } from "node:fs";
import type { MonoSection } from "./types.js";

const BEGIN_RE = /^#<<<\s+ENV\s+BEGIN\s+PATH=([^\s]+)\s*$/;
const END_RE = /^#>>>\s+ENV\s+END\s*$/;

export function parseMono(text: string): MonoSection[] {
  const lines = text.split(/\r?\n/);
  const sections: MonoSection[] = [];
  let cur: MonoSection | null = null;

  for (const line of lines) {
    const b = line.match(BEGIN_RE);
    if (b) {
      if (cur) throw new Error("Nested BEGIN found.");
      cur = { path: b[1], body: [] };
      continue;
    }
    if (END_RE.test(line)) {
      if (!cur) throw new Error("END without BEGIN.");
      sections.push(cur);
      cur = null;
      continue;
    }
    if (cur) cur.body.push(line);
  }
  if (cur) throw new Error("File ended with unclosed section.");
  return sections;
}

export function normalize(text: string): string {
  return (
    text
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .replace(/\n+$/g, "") + "\n"
  );
}

export function parseEnvFile(filePath: string): Array<{ key: string; value: string }> {
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const vars: Array<{ key: string; value: string }> = [];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2];

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      vars.push({ key, value });
    }
  }

  return vars;
}
