import { existsSync } from "node:fs";
import { getEnvFile } from "../lib/config.js";
import { decrypt } from "./decrypt.js";
import { sync } from "./sync.js";

export function local(): void {
  const env = "local" as const;
  const encFile = getEnvFile(env, true);

  if (!existsSync(encFile)) {
    console.error(`${encFile} not found`);
    console.error("\nEncrypt the local env file first:");
    console.error("  smonoenv encrypt local");
    process.exit(1);
  }

  decrypt(env);
  sync({ env, check: false, dry: false, clean: false, quiet: false });
}
