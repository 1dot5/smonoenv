import { execSync, spawnSync } from "node:child_process";

export function checkCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function ensureSops(): void {
  if (!checkCommand("sops")) {
    console.error("Missing required tool: sops");
    console.error("\nInstall with:");
    console.error("  brew install sops");
    process.exit(1);
  }
}

export function ensureTools(): void {
  const missing: string[] = [];
  if (!checkCommand("sops")) missing.push("sops");
  if (!checkCommand("age")) missing.push("age");

  if (missing.length > 0) {
    console.error(`Missing required tools: ${missing.join(", ")}`);
    console.error("\nInstall with:");
    console.error(`  brew install ${missing.join(" ")}`);
    process.exit(1);
  }
}

export function runSops(
  args: string[],
  env: NodeJS.ProcessEnv,
): { status: number } {
  const result = spawnSync("sops", args, { stdio: "inherit", env });
  return { status: result.status ?? 1 };
}

export function runSopsShell(
  command: string,
  env: NodeJS.ProcessEnv,
): void {
  execSync(command, { stdio: "inherit", shell: "/bin/sh", env });
}
