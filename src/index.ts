export { setup } from "./commands/setup.js";
export { encrypt } from "./commands/encrypt.js";
export { decrypt } from "./commands/decrypt.js";
export { edit } from "./commands/edit.js";
export { SyncError, sync } from "./commands/sync.js";
export { local } from "./commands/local.js";
export { exportEnv } from "./commands/export.js";
export type { ExportFormat } from "./commands/export.js";
export { PRINT_ENV_FORMATS, formatEnvVars, run } from "./commands/run.js";
export type { PrintEnvFormat, RunOptions } from "./commands/run.js";
export { parseMono, normalize, parseEnvFile } from "./lib/parser.js";
export {
  AGE_KEY_DIR,
  AGE_KEY_FILE,
  PROJECT_DIR_NAME,
  findProjectDir,
  getEnvFile,
  getMonoFile,
  getSopsEnv,
  targetFile,
} from "./lib/config.js";
export { checkCommand, ensureSops, ensureTools } from "./lib/sops.js";
export { parseArgs } from "./lib/args.js";
export type { ParsedArgs } from "./lib/args.js";
export {
  AgeKeyNotFoundError,
  describeKeySources,
  releaseAgeKey,
  resolveAgeKey,
} from "./lib/age-key.js";
export type {
  AgeKeyHandle,
  AgeKeySource,
  ResolveAgeKeyOptions,
} from "./lib/age-key.js";
export {
  DecryptError,
  EncryptedFileMissingError,
  decryptToFile,
  decryptToString,
} from "./lib/decrypt-core.js";
export type { DecryptOptions, DecryptResult } from "./lib/decrypt-core.js";
export { ENVS } from "./lib/types.js";
export type { Env, MonoSection, SyncOptions, SyncResult } from "./lib/types.js";
