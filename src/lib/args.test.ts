import { describe, it, expect } from "vitest";
import { parseArgs } from "./args.js";

function argv(...args: string[]): string[] {
  return ["node", "smonoenv", ...args];
}

describe("parseArgs", () => {
  it("parses a bare command", () => {
    const result = parseArgs(argv("local"));
    expect(result.command).toBe("local");
    expect(result.positional).toEqual([]);
    expect(result.flags.size).toBe(0);
  });

  it("parses command with positional arg", () => {
    const result = parseArgs(argv("encrypt", "staging"));
    expect(result.command).toBe("encrypt");
    expect(result.positional).toEqual(["staging"]);
  });

  it("parses boolean flags", () => {
    const result = parseArgs(argv("sync", "--check", "--dry"));
    expect(result.command).toBe("sync");
    expect(result.flags.has("--check")).toBe(true);
    expect(result.flags.has("--dry")).toBe(true);
    expect(result.positional).toEqual([]);
  });

  it("parses positional arg with boolean flags", () => {
    const result = parseArgs(argv("sync", "staging", "--check"));
    expect(result.command).toBe("sync");
    expect(result.positional).toEqual(["staging"]);
    expect(result.flags.has("--check")).toBe(true);
  });

  it("parses --format value flag correctly", () => {
    const result = parseArgs(argv("export", "--format", "key-value", ".env"));
    expect(result.command).toBe("export");
    expect(result.positional).toEqual([".env"]);
    expect(result.flagValues.get("--format")).toBe("key-value");
    expect(result.flags.has("--format")).toBe(true);
  });

  it("parses --format when file comes first", () => {
    const result = parseArgs(argv("export", ".env", "--format", "key-value"));
    expect(result.command).toBe("export");
    expect(result.positional).toEqual([".env"]);
    expect(result.flagValues.get("--format")).toBe("key-value");
  });

  it("handles no arguments", () => {
    const result = parseArgs(["node", "smonoenv"]);
    expect(result.command).toBeUndefined();
    expect(result.positional).toEqual([]);
  });

  it("handles --help as command", () => {
    const result = parseArgs(argv("--help"));
    expect(result.command).toBe("--help");
  });

  it("handles export without --format (uses default)", () => {
    const result = parseArgs(argv("export", "my.env"));
    expect(result.command).toBe("export");
    expect(result.positional).toEqual(["my.env"]);
    expect(result.flagValues.has("--format")).toBe(false);
  });

  it("does not treat --format value as a positional", () => {
    const result = parseArgs(argv("export", "--format", "key-value", "frontend/apps/user/.env"));
    expect(result.positional).not.toContain("key-value");
    expect(result.positional).toEqual(["frontend/apps/user/.env"]);
  });

  it("handles multiple positional args", () => {
    const result = parseArgs(argv("export", "a.env", "b.env"));
    expect(result.positional).toEqual(["a.env", "b.env"]);
  });

  it("handles mixed flags and positional args in any order", () => {
    const result = parseArgs(argv("sync", "--check", "production", "--quiet"));
    expect(result.command).toBe("sync");
    expect(result.positional).toEqual(["production"]);
    expect(result.flags.has("--check")).toBe(true);
    expect(result.flags.has("--quiet")).toBe(true);
  });
});
