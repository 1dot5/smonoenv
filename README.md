# smonoenv

Secret management CLI for monorepos using SOPS + age.

Manage all app environment variables in a single `.env.monorepo.<env>` file and automatically distribute them to each app's `.env`. Encryption is handled by [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age).

## Installation

```bash
npm install -g @1dot5/smonoenv

# or as a devDependency
npm install -D @1dot5/smonoenv

# use npx
npx @1dot5/smonoenv
```

### Prerequisites

```bash
brew install sops age
```

## Setup

```bash
smonoenv setup
```

On first run, this will:
- Verify that `sops` / `age` are installed
- Check that an age secret key is resolvable (project-local `.smonoenv/` or the global default path)
- Print which key source will be used

### age key resolution order

smonoenv looks up the age key in this priority (first match wins):

1. `SOPS_AGE_KEY_<ENV>` process env (inline value) — env-scoped
2. `SOPS_AGE_KEY_FILE_<ENV>` process env (path to file) — env-scoped
3. `<project>/.smonoenv/keys.<env>.txt` — project-local, env-scoped
4. `<project>/.smonoenv/keys.txt` — project-local, common
5. `SOPS_AGE_KEY` process env (inline value)
6. `SOPS_AGE_KEY_FILE` process env (path to file)
7. `~/.config/sops/age/keys.txt` — global legacy default

`<project>` is the nearest ancestor directory that contains a `.smonoenv/` folder, so any subdirectory inside the repo works.

### Recommended: project-local keys (`.smonoenv/`)

Using a project-local key keeps each repository's age identity isolated, so a leak in one project doesn't grant access to others.

```bash
# First time, in the repo root:
smonoenv setup --project --create-key
# → creates .smonoenv/keys.txt and adds it to .gitignore
```

For environment-scoped keys (recommended for staging / production):

```bash
smonoenv setup --project --env production --create-key
# → creates .smonoenv/keys.production.txt
```

Resulting layout:

```
<repo>/.smonoenv/
  keys.txt                  # project common (gitignored)
  keys.production.txt       # production-only (gitignored)
  keys.staging.txt          # staging-only (gitignored)
```

New team members receive the appropriate `keys.<env>.txt` from 1Password / your secret vault and drop it in `.smonoenv/`. `smonoenv setup --project` will acknowledge the file and confirm the public key.

### Legacy / global key (single identity for all projects)

Still supported for backwards compatibility. Drop a shared team key at:

```
~/.config/sops/age/keys.txt
```

Or generate a new one:

```bash
age-keygen -o ~/.config/sops/age/keys.txt
```

Note: the global key is used by every project on this machine. Prefer the project-local form above when working on more than one repository.

### CI / Docker: env vars

For CI runners and containers, inject the key via env var. smonoenv will materialize inline values to a `mode 0600` tmpfile that is cleaned up after use.

```bash
# global (used for all envs)
export SOPS_AGE_KEY="$(cat keys.txt)"

# env-scoped (wins over the global ones)
export SOPS_AGE_KEY_PRODUCTION="$(cat keys.production.txt)"
export SOPS_AGE_KEY_FILE_STAGING=/etc/secrets/keys.staging.txt
```

See the Docker / Fargate example further below.

## Monorepo env file format

`.env.monorepo.<env>` files use section delimiters to define environment variables for each app:

```dotenv
#<<< ENV BEGIN PATH=apps/web
DATABASE_URL=postgres://localhost:5432/mydb
NEXT_PUBLIC_API_URL=http://localhost:3000
#>>> ENV END

#<<< ENV BEGIN PATH=apps/api
DATABASE_URL=postgres://localhost:5432/mydb
PORT=3001
JWT_SECRET=dev-secret
#>>> ENV END

#<<< ENV BEGIN PATH=packages/shared
API_KEY=test-key
#>>> ENV END
```

`PATH=` takes a relative path from the repository root. Running sync generates a `.env` file at each path.

### Environment-suffixed output

Append `:<env-name>` to the path (e.g. `PATH=apps/web:production`) to output as `.env.production`:

```dotenv
#<<< ENV BEGIN PATH=apps/web:production
NEXT_PUBLIC_API_URL=https://api.example.com
#>>> ENV END
```

Outputs to `apps/web/.env.production`

## Commands

### `smonoenv setup`

Verify tooling and age key availability, and (optionally) generate a new key.

```bash
smonoenv setup                              # Verify existing setup
smonoenv setup --create-key                 # Generate a new age key at the default path
smonoenv setup --project --create-key       # Generate .smonoenv/keys.txt (project-local)
smonoenv setup --project --env production --create-key
                                            # Generate .smonoenv/keys.production.txt (env-scoped)
```

#### Options

| Flag | Description |
|------|-------------|
| `--create-key` | Generate a new age key |
| `--project` | Use project-local `.smonoenv/` instead of `~/.config/sops/age/` |
| `--env <env>` | Scope the age key to a specific env (`.smonoenv/keys.<env>.txt`) |

### `smonoenv local`

One-command local development setup. Internally runs `decrypt` then `sync`.

```bash
smonoenv local
```

Behavior:
1. Decrypts `.env.monorepo.local.sops` if it exists
2. Distributes `.env.monorepo.local` to each app's `.env`
3. If no encrypted file exists but `.env.monorepo.local.example` is found, copies it and provides guidance

### `smonoenv encrypt <env>`

Encrypt a plaintext file with SOPS.

```bash
smonoenv encrypt local
smonoenv encrypt staging
smonoenv encrypt production
```

`.env.monorepo.<env>` → `.env.monorepo.<env>.sops`

Encrypted files (`.sops`) can be safely committed to Git.

### `smonoenv decrypt <env>`

Decrypt a SOPS-encrypted file.

```bash
smonoenv decrypt staging
smonoenv decrypt production
```

`.env.monorepo.<env>.sops` → `.env.monorepo.<env>`

### `smonoenv edit <env>`

Edit an encrypted file directly with `$EDITOR`. Automatically handles decryption before editing and re-encryption after.

```bash
smonoenv edit staging
```

### `smonoenv run <env> -- <cmd> [args...]`

Container-friendly entrypoint. Decrypts `.env.monorepo.<env>.sops`, syncs app
`.env` files, then `exec`s the given command. Use this as the Dockerfile
`ENTRYPOINT` so your image never stores plaintext secrets.

```bash
# Fargate / K8s container startup
smonoenv run production -- node dist/main.js

# Scope to a single app
smonoenv run production --app apps/slack-bot -- node dist/main.js

# Load env into the current shell
eval "$(smonoenv run staging --print-env --format shell)"
```

#### Options

| Flag | Description |
|------|-------------|
| `--app <path>` | Only sync this app path. Repeatable. |
| `--clean` | Delete target `.env` files before syncing |
| `--keep-artifacts` | Keep decrypted plaintext + age key tmpfile (debug only) |
| `--no-sync` | Decrypt only (useful with `--print-env`) |
| `--print-env` | Print env to stdout instead of exec |
| `--format <fmt>` | `--print-env` format: `dotenv` (default), `shell`, `json` |
| `--quiet` | Suppress informational output |

#### age key resolution

`run` uses the same 7-step resolution order as the rest of smonoenv (see
[age key resolution order](#age-key-resolution-order) above), with `<ENV>`
bound to the `run` argument:

1. `SOPS_AGE_KEY_<ENV>` (inline) — env-scoped
2. `SOPS_AGE_KEY_FILE_<ENV>` (path) — env-scoped
3. `<project>/.smonoenv/keys.<env>.txt` — project-local, env-scoped
4. `<project>/.smonoenv/keys.txt` — project-local, common
5. `SOPS_AGE_KEY` (inline)
6. `SOPS_AGE_KEY_FILE` (path)
7. `~/.config/sops/age/keys.txt` — global legacy default

Inline values (`SOPS_AGE_KEY` / `SOPS_AGE_KEY_<ENV>`) are materialized to a
`mode 0600` tmpfile and deleted on exit. If none resolve, `run` exits with
code `2`.

#### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success (or child exited `0`) |
| `1` | decrypt / sync failure |
| `2` | age key not found |
| `127` | exec target not found |
| `≥128` | child terminated by signal |

### `smonoenv export <file> [--format <fmt>]`

Read a `.env` file and print its variables to stdout in the requested format. Useful for piping env values into other tools or CI steps that expect a single-line string.

```bash
smonoenv export apps/web/.env
smonoenv export apps/web/.env --format key-value
```

#### Options

| Flag | Description |
|------|-------------|
| `--format <fmt>` | Output format. Currently only `key-value` (default), which prints `KEY=val,KEY2=val2` on a single line |

### `smonoenv sync [env] [options]`

Distribute monorepo env variables to each app's `.env`. Defaults to `local` if env is omitted.

```bash
smonoenv sync              # distribute local
smonoenv sync staging      # distribute staging
```

#### Options

| Flag | Description |
|------|-------------|
| `--check` | Check sync status only. Exits with code 1 if drift is detected (for CI) |
| `--dry` | Dry run. No files are written |
| `--clean` | Delete existing .env files before syncing |
| `--quiet` | Suppress informational output |

## Common workflows

### New team member onboarding

```bash
# 1. Install tools
brew install sops age

# 2. Grab the project's age key(s) from 1Password and drop them in
#    .smonoenv/. For local dev you only need the common / local key.
mkdir -p .smonoenv
# cp ~/Downloads/keys.txt .smonoenv/keys.txt           # common
# cp ~/Downloads/keys.production.txt .smonoenv/keys.production.txt

# 3. Verify setup (will print which key source it picked up)
smonoenv setup --project

# 4. Set up local environment
smonoenv local
```

### Adding or changing environment variables

```bash
# 1. Edit directly
smonoenv edit local

# 2. Or edit the plaintext file and re-encrypt
smonoenv decrypt local
vi .env.monorepo.local
smonoenv encrypt local

# 3. Distribute to apps
smonoenv sync
```

### CI sync check

```yaml
# GitHub Actions
- run: smonoenv decrypt local
- run: smonoenv sync --check
```

### Generating .env files in GitHub Actions

When your CI/CD pipeline needs actual `.env` files (e.g. Next.js builds, E2E tests, Docker builds), register the age secret key as a GitHub Actions Secret and use `decrypt` → `sync` to generate them.

#### 1. Register the age secret key

```bash
# Project-local, env-scoped key (recommended)
cat .smonoenv/keys.production.txt

# Legacy global key
cat ~/.config/sops/age/keys.txt
```

Go to your GitHub repository's **Settings → Secrets and variables → Actions** and add it as `SOPS_AGE_KEY_PRODUCTION` (or `SOPS_AGE_KEY` for a single shared identity). Paste the entire key file contents.

#### 2. Workflow example

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install sops and age
        run: |
          curl -Lo /usr/local/bin/sops https://github.com/getsops/sops/releases/download/v3.9.4/sops-v3.9.4.linux.amd64
          chmod +x /usr/local/bin/sops
          curl -Lo age.tar.gz https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz
          tar xf age.tar.gz
          mv age/age /usr/local/bin/
          mv age/age-keygen /usr/local/bin/

      - name: Inject age key (env-scoped)
        run: |
          set -euo pipefail
          test -n "${SOPS_AGE_KEY_STAGING:-}" || (echo "SOPS_AGE_KEY_STAGING is empty"; exit 1)
        env:
          SOPS_AGE_KEY_STAGING: ${{ secrets.SOPS_AGE_KEY_STAGING }}

      - run: pnpm install --frozen-lockfile

      - name: Generate .env files
        env:
          SOPS_AGE_KEY_STAGING: ${{ secrets.SOPS_AGE_KEY_STAGING }}
        run: |
          npx smonoenv decrypt staging
          npx smonoenv sync staging

      - run: pnpm build
      - run: pnpm test
```

#### 3. Self-hosted runners

If `sops` / `age` are pre-installed on self-hosted runners, only the key setup step is needed:

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Generate .env files
    env:
      SOPS_AGE_KEY_PRODUCTION: ${{ secrets.SOPS_AGE_KEY_PRODUCTION }}
    run: |
      npx smonoenv decrypt production
      npx smonoenv sync production

  - run: pnpm build
```

The inline value in `SOPS_AGE_KEY_PRODUCTION` is materialized to a `mode 0600` tmpfile and cleaned up when the command exits; no file setup step is required.

#### 4. Per-environment configuration

Combine with GitHub Actions `environment` to inject only the key scoped to that deploy target. Each environment holds a different `SOPS_AGE_KEY_*` secret:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    steps:
      # ... checkout, setup omitted ...

      - name: Generate .env files
        env:
          # Each GitHub Environment provides its own *_<ENV> secret.
          SOPS_AGE_KEY_PRODUCTION: ${{ secrets.SOPS_AGE_KEY_PRODUCTION }}
          SOPS_AGE_KEY_STAGING: ${{ secrets.SOPS_AGE_KEY_STAGING }}
        run: |
          ENV_NAME=${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
          npx smonoenv decrypt $ENV_NAME
          npx smonoenv sync $ENV_NAME
```

Because smonoenv picks the `SOPS_AGE_KEY_<ENV>` matching `$ENV_NAME`, the staging job cannot accidentally decrypt production secrets even if both env vars are set.

#### 5. Security: Cleanup on self-hosted runners

GitHub-hosted runners are destroyed after each job, but files persist on self-hosted runners. Use `always()` to clean up regardless of success or failure:

```yaml
jobs:
  build:
    runs-on: [self-hosted]
    steps:
      - uses: actions/checkout@v4

      - name: Generate .env files
        env:
          SOPS_AGE_KEY_PRODUCTION: ${{ secrets.SOPS_AGE_KEY_PRODUCTION }}
        run: |
          npx smonoenv decrypt production
          npx smonoenv sync production

      - run: pnpm build
      - run: pnpm test

      - name: Cleanup secrets
        if: always()
        run: |
          rm -f .env.monorepo.*
          find . -name '.env' -not -path './node_modules/*' -delete
          find . -name '.env.*' -not -name '.env.example' -not -path './node_modules/*' -delete
```

Inline `SOPS_AGE_KEY_<ENV>` values are materialized to a tmpfile under `$TMPDIR` and unlinked when smonoenv exits, so no explicit key cleanup is required. Only the decrypted mono file and generated `.env` files need post-run cleanup on self-hosted runners.

## Running in Docker / Fargate / Kubernetes

For runtimes that start a container and expect a single secret source, use
`smonoenv run` as the entrypoint. It decrypts at container start, writes the
`.env` files, deletes the plaintext mono file, and `exec`s your app.

The only secret the platform needs to inject is the **age private key**.
All individual values (DB URL, API keys, tokens) stay in
`.env.monorepo.<env>.sops`, which is shipped inside the image.

### Dockerfile template

```dockerfile
FROM node:24-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl age \
 && SOPS_VER=3.9.4 && ARCH="$(dpkg --print-architecture)" \
 && curl -sSL -o /usr/local/bin/sops \
      "https://github.com/getsops/sops/releases/download/v${SOPS_VER}/sops-v${SOPS_VER}.linux.${ARCH}" \
 && chmod +x /usr/local/bin/sops \
 && rm -rf /var/lib/apt/lists/*

# Install smonoenv and build your app as usual
# ...

# Ship encrypted sops files in the image (.dockerignore excludes plaintext)
COPY .env.monorepo.staging.sops .env.monorepo.production.sops ./

ENTRYPOINT ["npx", "-y", "@1dot5/smonoenv", "run", "production", "--"]
CMD ["node", "dist/main.js"]
```

### ECS / Fargate Task Definition

```json
{
  "environment": [
    { "name": "APP_ENV", "value": "production" },
    { "name": "NODE_ENV", "value": "production" }
  ],
  "secrets": [
    {
      "name": "SOPS_AGE_KEY_PRODUCTION",
      "valueFrom": "arn:aws:secretsmanager:...:SOPS_AGE_KEY_PRODUCTION::"
    }
  ]
}
```

Use `SOPS_AGE_KEY_<ENV>` (env-scoped) so a production task can never load a
staging key by accident. If you only have a single identity for the project,
`SOPS_AGE_KEY` works as a fallback.

Only the age secret lives in Secrets Manager. Individual app env vars are
recovered by `smonoenv run` at container start from the `.sops` file.

### Kubernetes

```yaml
env:
  - name: SOPS_AGE_KEY_PRODUCTION
    valueFrom:
      secretKeyRef:
        name: smonoenv-age-keys
        key: keys.production.txt
```

### `.dockerignore`

Exclude plaintext env files and the age key from the build context:

```
.env
.env.local
**/.env
**/.env.local
.env.monorepo.local
.env.monorepo.staging
.env.monorepo.production
.smonoenv/keys.txt
.smonoenv/keys.*.txt
keys.txt
*.age-key
```

The `.sops` files are safe to include — they are encrypted.

### Security notes

- `.env.monorepo.<env>.sops` lives inside your image. Keep the registry
  private and restrict pull permissions.
- `smonoenv run` deletes the decrypted mono file and the age key tmpfile
  before `exec`. The `.env` files it wrote remain inside the container.
- Use `--keep-artifacts` only for debugging — it leaves plaintext on disk.
- `smonoenv run` forwards `SIGINT` / `SIGTERM` / `SIGHUP` to the child.
  For PID 1 zombie reaping, combine with `tini` (`docker run --init`).

## Environments

| Name | Purpose |
|------|---------|
| `local` | Local development |
| `staging` | Staging |
| `production` | Production |

## File structure

```
.env.monorepo.local           # Plaintext (recommended in .gitignore)
.env.monorepo.local.sops      # Encrypted (tracked in Git)
.env.monorepo.staging         # Plaintext
.env.monorepo.staging.sops    # Encrypted
.env.monorepo.production      # Plaintext
.env.monorepo.production.sops # Encrypted
.sops.yaml                    # SOPS encryption config
.smonoenv/keys.txt            # Project-local age key (optional, gitignored)
.smonoenv/keys.<env>.txt      # Env-scoped age key (optional, gitignored)
```

## Library usage

Can also be imported directly from Node.js:

```typescript
import { parseMono, normalize, parseEnvFile } from "@1dot5/smonoenv";
import { sync, decrypt, encrypt } from "@1dot5/smonoenv";
```

## License

MIT
