const VALUE_FLAGS = new Set(["--format", "--app", "--env"]);

export interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Set<string>;
  flagValues: Map<string, string>;
  flagMultiValues: Map<string, string[]>;
  passthrough: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const raw = argv.slice(2);
  const command = raw[0];
  const flags = new Set<string>();
  const flagValues = new Map<string, string>();
  const flagMultiValues = new Map<string, string[]>();
  const positional: string[] = [];
  const passthrough: string[] = [];
  let afterSeparator = false;

  for (let i = 1; i < raw.length; i++) {
    const arg = raw[i];
    if (afterSeparator) {
      passthrough.push(arg);
      continue;
    }
    if (arg === "--") {
      afterSeparator = true;
      continue;
    }
    if (arg.startsWith("--")) {
      flags.add(arg);
      if (VALUE_FLAGS.has(arg) && i + 1 < raw.length) {
        const value = raw[i + 1];
        flagValues.set(arg, value);
        const existing = flagMultiValues.get(arg) ?? [];
        existing.push(value);
        flagMultiValues.set(arg, existing);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    command,
    positional,
    flags,
    flagValues,
    flagMultiValues,
    passthrough,
  };
}
