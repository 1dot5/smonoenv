import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgeKeyNotFoundError,
  releaseAgeKey,
  resolveAgeKey,
} from "./age-key.js";
import { PROJECT_DIR_NAME } from "./config.js";

const SAMPLE_KEY =
  "# created: test\n# public key: age1testpublickey\nAGE-SECRET-KEY-1TESTSECRETKEY";
const SCOPED_KEY =
  "# created: test\n# public key: age1scopedpublickey\nAGE-SECRET-KEY-1SCOPEDSECRETKEY";

describe("resolveAgeKey", () => {
  let work: string;
  const defaultKeyPathMissing = () => join(work, "never-exists.txt");
  const defaultOpts = () => ({
    cwd: work,
    defaultKeyPath: defaultKeyPathMissing(),
  });

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "smonoenv-agekey-test-"));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it("materializes SOPS_AGE_KEY inline value to a tmpfile", () => {
    const handle = resolveAgeKey({ SOPS_AGE_KEY: SAMPLE_KEY }, defaultOpts());
    try {
      expect(handle.source).toBe("env-value");
      expect(handle.tmpFile).toBeDefined();
      expect(existsSync(handle.tmpFile!)).toBe(true);
      expect(readFileSync(handle.tmpFile!, "utf8")).toContain(
        "AGE-SECRET-KEY-1TESTSECRETKEY",
      );
      expect(handle.env.SOPS_AGE_KEY_FILE).toBe(handle.tmpFile);
      expect(handle.env.SOPS_AGE_KEY).toBeUndefined();
    } finally {
      releaseAgeKey(handle);
    }
    expect(existsSync(handle.tmpFile!)).toBe(false);
  });

  it("uses SOPS_AGE_KEY_FILE when it exists (no tmpfile)", () => {
    const keyPath = join(work, "keys.txt");
    writeFileSync(keyPath, SAMPLE_KEY);
    const handle = resolveAgeKey(
      { SOPS_AGE_KEY_FILE: keyPath },
      defaultOpts(),
    );
    expect(handle.source).toBe("env-file");
    expect(handle.tmpFile).toBeUndefined();
    expect(handle.env.SOPS_AGE_KEY_FILE).toBe(keyPath);
  });

  it("falls through SOPS_AGE_KEY_FILE if path does not exist", () => {
    const missingPath = join(work, "not-there.txt");
    const defaultPath = join(work, "default-keys.txt");
    writeFileSync(defaultPath, SAMPLE_KEY);
    const handle = resolveAgeKey(
      { SOPS_AGE_KEY_FILE: missingPath },
      { cwd: work, defaultKeyPath: defaultPath },
    );
    expect(handle.source).toBe("default-path");
    expect(handle.env.SOPS_AGE_KEY_FILE).toBe(defaultPath);
  });

  it("uses default key path when no env var provided", () => {
    const defaultPath = join(work, "default-keys.txt");
    writeFileSync(defaultPath, SAMPLE_KEY);
    const handle = resolveAgeKey(
      {},
      { cwd: work, defaultKeyPath: defaultPath },
    );
    expect(handle.source).toBe("default-path");
    expect(handle.env.SOPS_AGE_KEY_FILE).toBe(defaultPath);
  });

  it("throws AgeKeyNotFoundError when no key is resolvable", () => {
    expect(() => resolveAgeKey({}, defaultOpts())).toThrow(AgeKeyNotFoundError);
  });

  it("treats whitespace-only SOPS_AGE_KEY as unset", () => {
    const defaultPath = join(work, "default-keys.txt");
    writeFileSync(defaultPath, SAMPLE_KEY);
    const handle = resolveAgeKey(
      { SOPS_AGE_KEY: "   " },
      { cwd: work, defaultKeyPath: defaultPath },
    );
    expect(handle.source).toBe("default-path");
    expect(handle.tmpFile).toBeUndefined();
  });

  it("releaseAgeKey is idempotent", () => {
    const handle = resolveAgeKey(
      { SOPS_AGE_KEY: SAMPLE_KEY },
      defaultOpts(),
    );
    releaseAgeKey(handle);
    expect(() => releaseAgeKey(handle)).not.toThrow();
  });

  describe("env-scoped resolution", () => {
    it("prefers SOPS_AGE_KEY_<ENV> over global SOPS_AGE_KEY", () => {
      const handle = resolveAgeKey(
        { SOPS_AGE_KEY: SAMPLE_KEY, SOPS_AGE_KEY_PRODUCTION: SCOPED_KEY },
        { ...defaultOpts(), env: "production" },
      );
      try {
        expect(handle.source).toBe("env-value-scoped");
        expect(readFileSync(handle.tmpFile!, "utf8")).toContain(
          "AGE-SECRET-KEY-1SCOPEDSECRETKEY",
        );
      } finally {
        releaseAgeKey(handle);
      }
    });

    it("prefers SOPS_AGE_KEY_FILE_<ENV> over global SOPS_AGE_KEY_FILE", () => {
      const globalKey = join(work, "global.txt");
      const scopedKey = join(work, "scoped.txt");
      writeFileSync(globalKey, SAMPLE_KEY);
      writeFileSync(scopedKey, SCOPED_KEY);
      const handle = resolveAgeKey(
        {
          SOPS_AGE_KEY_FILE: globalKey,
          SOPS_AGE_KEY_FILE_STAGING: scopedKey,
        },
        { ...defaultOpts(), env: "staging" },
      );
      expect(handle.source).toBe("env-file-scoped");
      expect(handle.env.SOPS_AGE_KEY_FILE).toBe(scopedKey);
    });

    it("falls back when SOPS_AGE_KEY_FILE_<ENV> is unset", () => {
      const defaultPath = join(work, "default.txt");
      writeFileSync(defaultPath, SAMPLE_KEY);
      const handle = resolveAgeKey(
        {},
        { cwd: work, defaultKeyPath: defaultPath, env: "production" },
      );
      expect(handle.source).toBe("default-path");
    });
  });

  describe("project-local resolution (.smonoenv/)", () => {
    function makeProjectDir(): string {
      const dir = join(work, PROJECT_DIR_NAME);
      mkdirSync(dir, { recursive: true });
      return dir;
    }

    it("uses .smonoenv/keys.txt when present", () => {
      const dir = makeProjectDir();
      const projectKey = join(dir, "keys.txt");
      writeFileSync(projectKey, SAMPLE_KEY);
      const handle = resolveAgeKey({}, defaultOpts());
      expect(handle.source).toBe("project-file");
      expect(handle.env.SOPS_AGE_KEY_FILE).toBe(projectKey);
    });

    it("prefers .smonoenv/keys.<env>.txt over .smonoenv/keys.txt", () => {
      const dir = makeProjectDir();
      writeFileSync(join(dir, "keys.txt"), SAMPLE_KEY);
      const scopedPath = join(dir, "keys.production.txt");
      writeFileSync(scopedPath, SCOPED_KEY);
      const handle = resolveAgeKey(
        {},
        { ...defaultOpts(), env: "production" },
      );
      expect(handle.source).toBe("project-file-scoped");
      expect(handle.env.SOPS_AGE_KEY_FILE).toBe(scopedPath);
    });

    it("walks up from a nested cwd to find .smonoenv/", () => {
      const dir = makeProjectDir();
      writeFileSync(join(dir, "keys.txt"), SAMPLE_KEY);
      const nested = join(work, "apps", "web");
      mkdirSync(nested, { recursive: true });
      const handle = resolveAgeKey(
        {},
        { cwd: nested, defaultKeyPath: defaultKeyPathMissing() },
      );
      expect(handle.source).toBe("project-file");
    });

    it("env-scoped env vars win over project-local files", () => {
      const dir = makeProjectDir();
      writeFileSync(join(dir, "keys.production.txt"), SAMPLE_KEY);
      const handle = resolveAgeKey(
        { SOPS_AGE_KEY_PRODUCTION: SCOPED_KEY },
        { ...defaultOpts(), env: "production" },
      );
      try {
        expect(handle.source).toBe("env-value-scoped");
      } finally {
        releaseAgeKey(handle);
      }
    });

    it("project-local files win over global SOPS_AGE_KEY", () => {
      const dir = makeProjectDir();
      const projectKey = join(dir, "keys.txt");
      writeFileSync(projectKey, SAMPLE_KEY);
      const handle = resolveAgeKey(
        { SOPS_AGE_KEY: SCOPED_KEY },
        defaultOpts(),
      );
      expect(handle.source).toBe("project-file");
      expect(handle.env.SOPS_AGE_KEY_FILE).toBe(projectKey);
    });
  });
});
