import { parseEnvFile } from "../lib/parser.js";

export type ExportFormat = "key-value";

const FORMATS: Record<ExportFormat, (vars: Array<{ key: string; value: string }>) => string> = {
  "key-value": (vars) => vars.map(({ key, value }) => `${key}=${value}`).join(","),
};

export function exportEnv(filePath: string, format: ExportFormat): void {
  const vars = parseEnvFile(filePath);
  console.log(FORMATS[format](vars));
}
