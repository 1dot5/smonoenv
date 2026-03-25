import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseMono, normalize, parseEnvFile } from "./parser.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseMono", () => {
  it("parses a single section", () => {
    const text = [
      "#<<< ENV BEGIN PATH=apps/web",
      "FOO=bar",
      "BAZ=qux",
      "#>>> ENV END",
    ].join("\n");

    const sections = parseMono(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].path).toBe("apps/web");
    expect(sections[0].body).toEqual(["FOO=bar", "BAZ=qux"]);
  });

  it("parses multiple sections", () => {
    const text = [
      "#<<< ENV BEGIN PATH=apps/web",
      "A=1",
      "#>>> ENV END",
      "",
      "#<<< ENV BEGIN PATH=apps/api",
      "B=2",
      "#>>> ENV END",
    ].join("\n");

    const sections = parseMono(text);
    expect(sections).toHaveLength(2);
    expect(sections[0].path).toBe("apps/web");
    expect(sections[1].path).toBe("apps/api");
  });

  it("parses path with env suffix", () => {
    const text = [
      "#<<< ENV BEGIN PATH=apps/web:production",
      "KEY=val",
      "#>>> ENV END",
    ].join("\n");

    const sections = parseMono(text);
    expect(sections[0].path).toBe("apps/web:production");
  });

  it("includes empty lines and comments in body", () => {
    const text = [
      "#<<< ENV BEGIN PATH=apps/web",
      "# comment",
      "",
      "FOO=bar",
      "#>>> ENV END",
    ].join("\n");

    const sections = parseMono(text);
    expect(sections[0].body).toEqual(["# comment", "", "FOO=bar"]);
  });

  it("throws on nested BEGIN", () => {
    const text = [
      "#<<< ENV BEGIN PATH=apps/web",
      "#<<< ENV BEGIN PATH=apps/api",
      "#>>> ENV END",
    ].join("\n");

    expect(() => parseMono(text)).toThrow("Nested BEGIN found.");
  });

  it("throws on END without BEGIN", () => {
    const text = "#>>> ENV END";
    expect(() => parseMono(text)).toThrow("END without BEGIN.");
  });

  it("throws on unclosed section", () => {
    const text = [
      "#<<< ENV BEGIN PATH=apps/web",
      "FOO=bar",
    ].join("\n");

    expect(() => parseMono(text)).toThrow("File ended with unclosed section.");
  });

  it("ignores lines outside sections", () => {
    const text = [
      "# Global comment",
      "OUTSIDE=ignored",
      "#<<< ENV BEGIN PATH=apps/web",
      "FOO=bar",
      "#>>> ENV END",
      "ALSO_OUTSIDE=ignored",
    ].join("\n");

    const sections = parseMono(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toEqual(["FOO=bar"]);
  });

  it("returns empty array for text with no sections", () => {
    expect(parseMono("")).toEqual([]);
    expect(parseMono("# just a comment\nFOO=bar")).toEqual([]);
  });

  it("handles Windows-style line endings", () => {
    const text = "#<<< ENV BEGIN PATH=apps/web\r\nFOO=bar\r\n#>>> ENV END\r\n";
    const sections = parseMono(text);
    expect(sections).toHaveLength(1);
    expect(sections[0].body).toEqual(["FOO=bar"]);
  });
});

describe("normalize", () => {
  it("ensures single trailing newline", () => {
    expect(normalize("foo\nbar")).toBe("foo\nbar\n");
  });

  it("removes multiple trailing newlines", () => {
    expect(normalize("foo\nbar\n\n\n")).toBe("foo\nbar\n");
  });

  it("strips trailing whitespace from lines", () => {
    expect(normalize("foo  \nbar\t")).toBe("foo\nbar\n");
  });

  it("removes carriage returns", () => {
    expect(normalize("foo\r\nbar\r\n")).toBe("foo\nbar\n");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("\n");
  });

  it("handles single line", () => {
    expect(normalize("hello")).toBe("hello\n");
  });
});

describe("parseEnvFile", () => {
  const testDir = join(tmpdir(), "smonoenv-test-" + process.pid);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeEnv(name: string, content: string): string {
    const p = join(testDir, name);
    writeFileSync(p, content, "utf8");
    return p;
  }

  it("parses simple key-value pairs", () => {
    const p = writeEnv(".env", "FOO=bar\nBAZ=qux\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([
      { key: "FOO", value: "bar" },
      { key: "BAZ", value: "qux" },
    ]);
  });

  it("skips comments and empty lines", () => {
    const p = writeEnv(".env", "# comment\n\nFOO=bar\n  \n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([{ key: "FOO", value: "bar" }]);
  });

  it("strips double-quoted values", () => {
    const p = writeEnv(".env", 'KEY="hello world"\n');
    const vars = parseEnvFile(p);
    expect(vars).toEqual([{ key: "KEY", value: "hello world" }]);
  });

  it("strips single-quoted values", () => {
    const p = writeEnv(".env", "KEY='hello world'\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([{ key: "KEY", value: "hello world" }]);
  });

  it("does not strip mismatched quotes", () => {
    const p = writeEnv(".env", "KEY=\"hello'\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([{ key: "KEY", value: "\"hello'" }]);
  });

  it("handles values with = signs", () => {
    const p = writeEnv(".env", "URL=https://example.com?a=1&b=2\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([{ key: "URL", value: "https://example.com?a=1&b=2" }]);
  });

  it("handles empty values", () => {
    const p = writeEnv(".env", "EMPTY=\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([{ key: "EMPTY", value: "" }]);
  });

  it("handles keys with underscores and numbers", () => {
    const p = writeEnv(".env", "MY_VAR_2=test\n_PRIVATE=secret\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([
      { key: "MY_VAR_2", value: "test" },
      { key: "_PRIVATE", value: "secret" },
    ]);
  });

  it("exits on non-existent file", () => {
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => parseEnvFile("/nonexistent/.env")).toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith("File not found: /nonexistent/.env");

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it("handles Windows line endings", () => {
    const p = writeEnv(".env", "A=1\r\nB=2\r\n");
    const vars = parseEnvFile(p);
    expect(vars).toEqual([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
  });
});
