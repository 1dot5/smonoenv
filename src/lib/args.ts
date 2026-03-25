const VALUE_FLAGS = new Set(["--format"]);

export interface ParsedArgs {
  command: string | undefined;
  positional: string[];
  flags: Set<string>;
  flagValues: Map<string, string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const raw = argv.slice(2);
  const command = raw[0];
  const flags = new Set<string>();
  const flagValues = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 1; i < raw.length; i++) {
    const arg = raw[i];
    if (arg.startsWith("--")) {
      flags.add(arg);
      if (VALUE_FLAGS.has(arg) && i + 1 < raw.length) {
        flagValues.set(arg, raw[i + 1]);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags, flagValues };
}
