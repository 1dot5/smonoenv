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
- Check for an age secret key at `~/.config/sops/age/keys.txt`
- If no key is found, guide you through retrieving it from 1Password or generating a new one

### Placing the age key

Obtain the shared team key and save it to:

```
~/.config/sops/age/keys.txt
```

For new projects:

```bash
age-keygen -o ~/.config/sops/age/keys.txt
```

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

# 2. Get the age key from 1Password
mkdir -p ~/.config/sops/age
# Save keys.txt

# 3. Verify setup
smonoenv setup

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
# Check your local age secret key
cat ~/.config/sops/age/keys.txt
```

Go to your GitHub repository's **Settings → Secrets and variables → Actions** and add it as `SOPS_AGE_KEY` (paste the entire key file contents).

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

      - name: Setup age key
        run: |
          mkdir -p ~/.config/sops/age
          echo "${{ secrets.SOPS_AGE_KEY }}" > ~/.config/sops/age/keys.txt

      - run: pnpm install --frozen-lockfile

      - name: Generate .env files
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

  - name: Setup age key
    run: |
      mkdir -p ~/.config/sops/age
      echo "${{ secrets.SOPS_AGE_KEY }}" > ~/.config/sops/age/keys.txt

  - name: Generate .env files
    run: |
      npx smonoenv decrypt production
      npx smonoenv sync production

  - run: pnpm build
```

#### 4. Per-environment configuration

Combine with GitHub Actions `environment` to generate the appropriate `.env` for each deploy target:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    steps:
      # ... checkout, setup omitted ...

      - name: Generate .env files
        run: |
          ENV_NAME=${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
          npx smonoenv decrypt $ENV_NAME
          npx smonoenv sync $ENV_NAME
```

#### 5. Security: Cleanup on self-hosted runners

GitHub-hosted runners are destroyed after each job, but files persist on self-hosted runners. Use `always()` to clean up regardless of success or failure:

```yaml
jobs:
  build:
    runs-on: [self-hosted]
    steps:
      - uses: actions/checkout@v4

      - name: Setup age key
        run: |
          mkdir -p ~/.config/sops/age
          echo "${{ secrets.SOPS_AGE_KEY }}" > ~/.config/sops/age/keys.txt

      - name: Generate .env files
        run: |
          npx smonoenv decrypt production
          npx smonoenv sync production

      - run: pnpm build
      - run: pnpm test

      - name: Cleanup secrets
        if: always()
        run: |
          rm -f ~/.config/sops/age/keys.txt
          rm -f .env.monorepo.*
          find . -name '.env' -not -path './node_modules/*' -delete
          find . -name '.env.*' -not -name '.env.example' -not -path './node_modules/*' -delete
```

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
```

## Library usage

Can also be imported directly from Node.js:

```typescript
import { parseMono, normalize, parseEnvFile } from "@1dot5/smonoenv";
import { sync, decrypt, encrypt } from "@1dot5/smonoenv";
```

## License

MIT
