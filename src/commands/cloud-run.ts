import { parseEnvFile } from "../lib/parser.js";

export function cloudRun(envFile: string): void {
  const vars = parseEnvFile(envFile);

  const formatted = vars.map(({ key, value }) => {
    const escaped = value.replace(/,/g, "\\,");
    return `${key}=${escaped}`;
  });

  console.log(formatted.join(","));
}
