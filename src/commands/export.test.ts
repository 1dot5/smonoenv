import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { exportEnv } from "./export.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("exportEnv", () => {
  const testDir = join(tmpdir(), "smonoenv-export-test-" + process.pid);
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  function writeEnv(name: string, content: string): string {
    const p = join(testDir, name);
    writeFileSync(p, content, "utf8");
    return p;
  }

  it("outputs key-value format with comma separation", () => {
    const p = writeEnv(".env", "FOO=bar\nBAZ=qux\n");
    exportEnv(p, "key-value");
    expect(logSpy).toHaveBeenCalledWith("FOO=bar,BAZ=qux");
  });

  it("handles single variable", () => {
    const p = writeEnv(".env", "ONLY=one\n");
    exportEnv(p, "key-value");
    expect(logSpy).toHaveBeenCalledWith("ONLY=one");
  });

  it("skips comments in output", () => {
    const p = writeEnv(".env", "# comment\nA=1\n# another\nB=2\n");
    exportEnv(p, "key-value");
    expect(logSpy).toHaveBeenCalledWith("A=1,B=2");
  });

  it("handles empty env file", () => {
    const p = writeEnv(".env", "# only comments\n\n");
    exportEnv(p, "key-value");
    expect(logSpy).toHaveBeenCalledWith("");
  });

  it("strips quotes from values", () => {
    const p = writeEnv(".env", 'KEY="quoted value"\n');
    exportEnv(p, "key-value");
    expect(logSpy).toHaveBeenCalledWith("KEY=quoted value");
  });

  it("preserves values with special characters", () => {
    const p = writeEnv(".env", "URL=https://example.com?a=1&b=2\nAPI_KEY=abc123==\n");
    exportEnv(p, "key-value");
    expect(logSpy).toHaveBeenCalledWith("URL=https://example.com?a=1&b=2,API_KEY=abc123==");
  });
});
