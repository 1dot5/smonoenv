import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PROJECT_DIR_NAME,
  findProjectDir,
  getEnvFile,
  getMonoFile,
  targetFile,
} from "./config.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("getEnvFile", () => {
  it("returns plaintext filename", () => {
    expect(getEnvFile("local")).toBe(".env.monorepo.local");
    expect(getEnvFile("staging")).toBe(".env.monorepo.staging");
    expect(getEnvFile("production")).toBe(".env.monorepo.production");
  });

  it("returns encrypted filename", () => {
    expect(getEnvFile("local", true)).toBe(".env.monorepo.local.sops");
    expect(getEnvFile("staging", true)).toBe(".env.monorepo.staging.sops");
  });

  it("defaults to plaintext", () => {
    expect(getEnvFile("local")).toBe(getEnvFile("local", false));
  });
});

describe("getMonoFile", () => {
  const testDir = join(tmpdir(), "smonoenv-config-test-" + process.pid);

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns new-style path when file exists", () => {
    writeFileSync(join(testDir, ".env.monorepo.staging"), "X=1");
    expect(getMonoFile("staging", testDir)).toBe(join(testDir, ".env.monorepo.staging"));
  });

  it("falls back to legacy name for local env", () => {
    writeFileSync(join(testDir, ".env.monorepo"), "X=1");
    expect(getMonoFile("local", testDir)).toBe(join(testDir, ".env.monorepo"));
  });

  it("does not fall back to legacy name for non-local env", () => {
    writeFileSync(join(testDir, ".env.monorepo"), "X=1");
    expect(getMonoFile("staging", testDir)).toBe(join(testDir, ".env.monorepo.staging"));
  });

  it("returns new-style path when neither file exists", () => {
    expect(getMonoFile("production", testDir)).toBe(join(testDir, ".env.monorepo.production"));
  });

  it("prefers new-style over legacy for local", () => {
    writeFileSync(join(testDir, ".env.monorepo.local"), "new");
    writeFileSync(join(testDir, ".env.monorepo"), "old");
    expect(getMonoFile("local", testDir)).toBe(join(testDir, ".env.monorepo.local"));
  });
});

describe("targetFile", () => {
  it("returns .env path for simple path", () => {
    expect(targetFile("apps/web", "/project")).toBe(join("/project", "apps/web", ".env"));
  });

  it("returns env-suffixed path for path with colon", () => {
    expect(targetFile("apps/web:production", "/project")).toBe(
      join("/project", "apps/web", ".env.production"),
    );
  });

  it("strips leading dot from env suffix", () => {
    expect(targetFile("apps/web:.production", "/project")).toBe(
      join("/project", "apps/web", ".env.production"),
    );
  });

  it("handles deeply nested paths", () => {
    expect(targetFile("packages/shared/config", "/root")).toBe(
      join("/root", "packages/shared/config", ".env"),
    );
  });
});

describe("findProjectDir", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "smonoenv-findproj-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns null when no .smonoenv/ is found", () => {
    expect(findProjectDir(root)).toBeNull();
  });

  it("finds .smonoenv/ at the given cwd", () => {
    const dir = join(root, PROJECT_DIR_NAME);
    mkdirSync(dir, { recursive: true });
    expect(findProjectDir(root)).toBe(dir);
  });

  it("walks up parent directories", () => {
    const dir = join(root, PROJECT_DIR_NAME);
    mkdirSync(dir, { recursive: true });
    const nested = join(root, "apps", "web", "src");
    mkdirSync(nested, { recursive: true });
    expect(findProjectDir(nested)).toBe(dir);
  });
});
