import { describe, expect, it } from "vitest";
import { formatEnvVars } from "./run.js";

describe("formatEnvVars", () => {
  const vars = [
    { key: "A", value: "1" },
    { key: "B", value: "hello world" },
    { key: "C", value: "it's fine" },
  ];

  it("dotenv format", () => {
    expect(formatEnvVars(vars, "dotenv")).toBe(
      "A=1\nB=hello world\nC=it's fine\n",
    );
  });

  it("shell format single-quotes values and escapes single quotes", () => {
    const out = formatEnvVars(vars, "shell");
    expect(out).toContain("export A='1'");
    expect(out).toContain("export B='hello world'");
    // "it's fine" -> 'it'\''s fine'
    expect(out).toContain(`export C='it'\\''s fine'`);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("json format emits an object keyed by env name", () => {
    const out = formatEnvVars(vars, "json");
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ A: "1", B: "hello world", C: "it's fine" });
  });

  it("handles empty input", () => {
    expect(formatEnvVars([], "dotenv")).toBe("\n");
    expect(formatEnvVars([], "shell")).toBe("\n");
    expect(JSON.parse(formatEnvVars([], "json"))).toEqual({});
  });
});
