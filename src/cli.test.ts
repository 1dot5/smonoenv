import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const CLI = join(import.meta.dirname, "../dist/cli.js");

function run(...args: string[]): string {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf8",
    timeout: 5000,
  }).trim();
}

function runWithError(...args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    return { stdout, stderr: "", status: 0 };
  } catch (e: any) {
    return {
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").trim(),
      status: e.status ?? 1,
    };
  }
}

describe("CLI integration", () => {
  const testDir = join(tmpdir(), "smonoenv-cli-test-" + process.pid);

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

  describe("help", () => {
    it("shows usage with help command", () => {
      const out = run("help");
      expect(out).toContain("smonoenv - SOPS + age Secret Management");
      expect(out).toContain("Commands:");
    });

    it("shows usage with --help flag", () => {
      const out = run("--help");
      expect(out).toContain("smonoenv - SOPS + age Secret Management");
    });

    it("shows usage with no args", () => {
      const out = run();
      expect(out).toContain("smonoenv - SOPS + age Secret Management");
    });
  });

  describe("export", () => {
    it("exports env file without --format flag", () => {
      const p = writeEnv("test.env", "A=1\nB=2\n");
      const out = run("export", p);
      expect(out).toBe("A=1,B=2");
    });

    it("exports with --format key-value after file", () => {
      const p = writeEnv("test.env", "X=hello\nY=world\n");
      const out = run("export", p, "--format", "key-value");
      expect(out).toBe("X=hello,Y=world");
    });

    it("exports with --format key-value before file (the bug case)", () => {
      const p = writeEnv("test.env", "FOO=bar\nBAZ=qux\n");
      const out = run("export", "--format", "key-value", p);
      expect(out).toBe("FOO=bar,BAZ=qux");
    });

    it("errors on missing file argument", () => {
      const { stderr, status } = runWithError("export");
      expect(status).not.toBe(0);
      expect(stderr).toContain("Usage: smonoenv export");
    });

    it("errors on non-existent file", () => {
      const { stderr, status } = runWithError("export", "/nonexistent/file.env");
      expect(status).not.toBe(0);
      expect(stderr).toContain("File not found");
    });
  });

  describe("unknown command", () => {
    it("exits with error for unknown command", () => {
      const { stderr, status } = runWithError("foobar");
      expect(status).not.toBe(0);
      expect(stderr).toContain("Unknown command: foobar");
    });
  });
});
