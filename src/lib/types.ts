export const ENVS = ["local", "staging", "production"] as const;
export type Env = (typeof ENVS)[number];

export interface MonoSection {
  path: string;
  body: string[];
}

export interface SyncOptions {
  env: Env;
  check: boolean;
  dry: boolean;
  clean: boolean;
  quiet: boolean;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  drifted: number;
}
