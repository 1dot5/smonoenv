# smonoenv

SOPS + age によるモノレポ向け環境変数管理 CLI。

1つの `.env.monorepo.<env>` ファイルにすべてのアプリの環境変数をまとめて管理し、各アプリの `.env` に自動展開する。暗号化には [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age) を使用。

## インストール

```bash
# GitHub Packages から
npm install -g @1dot5/smonoenv

# または devDependencies として
pnpm add -D @1dot5/smonoenv
```

### 前提ツール

```bash
brew install sops age
```

## セットアップ

```bash
smonoenv setup
```

初回実行時に以下を行う:
- `sops` / `age` がインストール済みか確認
- `~/.config/sops/age/keys.txt` に age 秘密鍵があるかチェック
- 鍵がない場合、1Password からの取得方法 or 新規生成コマンドを案内

### age 鍵の配置

チームで共有している鍵を入手し、以下に保存する:

```
~/.config/sops/age/keys.txt
```

新規プロジェクトの場合:

```bash
age-keygen -o ~/.config/sops/age/keys.txt
```

## モノレポ環境変数ファイルの書式

`.env.monorepo.<env>` ファイルは、セクション区切りで各アプリの環境変数を記述する:

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

`PATH=` にはリポジトリルートからの相対パスを指定する。sync 実行時に各パスへ `.env` ファイルが生成される。

### 環境名付きの出力

`PATH=apps/web:production` のように `:環境名` を付けると、`.env.production` として出力される:

```dotenv
#<<< ENV BEGIN PATH=apps/web:production
NEXT_PUBLIC_API_URL=https://api.example.com
#>>> ENV END
```

→ `apps/web/.env.production` に出力

## コマンド一覧

### `smonoenv local`

ローカル開発環境を一発セットアップ。内部で `decrypt` → `sync` を実行する。

```bash
smonoenv local
```

動作:
1. `.env.monorepo.local.sops` があれば復号
2. `.env.monorepo.local` を各アプリの `.env` に展開
3. 暗号化ファイルがなく `.env.monorepo.local.example` があれば、コピーして案内

### `smonoenv encrypt <env>`

平文ファイルを SOPS で暗号化する。

```bash
smonoenv encrypt local
smonoenv encrypt staging
smonoenv encrypt production
```

`.env.monorepo.<env>` → `.env.monorepo.<env>.sops`

暗号化済みファイル (`.sops`) は Git にコミットして安全に共有できる。

### `smonoenv decrypt <env>`

SOPS 暗号化ファイルを復号する。

```bash
smonoenv decrypt staging
smonoenv decrypt production
```

`.env.monorepo.<env>.sops` → `.env.monorepo.<env>`

### `smonoenv edit <env>`

暗号化ファイルを `$EDITOR` で直接編集する。復号→編集→再暗号化を自動で行う。

```bash
smonoenv edit staging
```

### `smonoenv sync [env] [options]`

モノレポ環境変数ファイルを各アプリの `.env` に展開する。env を省略すると `local` が使われる。

```bash
smonoenv sync              # local を展開
smonoenv sync staging      # staging を展開
```

#### オプション

| フラグ | 説明 |
|--------|------|
| `--check` | 同期状態のチェックのみ。差分があれば exit 1（CI 用） |
| `--dry` | ドライラン。実際のファイル書き込みは行わない |
| `--clean` | sync 前に既存の .env ファイルを削除 |
| `--quiet` | 情報出力を抑制 |

### `smonoenv cloud-run <file>`

`.env` ファイルを Cloud Run の `--set-env-vars` 形式に変換して出力する。

```bash
smonoenv cloud-run .env
# => KEY1=value1,KEY2=value2,...
```

デプロイスクリプトで使用:

```bash
gcloud run deploy my-service \
  --set-env-vars "$(smonoenv cloud-run .env.monorepo.production)"
```

## 典型的なワークフロー

### 新メンバーのオンボーディング

```bash
# 1. ツールのインストール
brew install sops age

# 2. age 鍵を 1Password から取得して配置
mkdir -p ~/.config/sops/age
# keys.txt を保存

# 3. セットアップ確認
smonoenv setup

# 4. ローカル環境構築
smonoenv local
```

### 環境変数の追加・変更

```bash
# 1. 直接編集する場合
smonoenv edit local

# 2. または平文ファイルを編集して再暗号化
smonoenv decrypt local
vi .env.monorepo.local
smonoenv encrypt local

# 3. 各アプリに反映
smonoenv sync
```

### CI での同期チェック

```yaml
# GitHub Actions
- run: smonoenv decrypt local
- run: smonoenv sync --check
```

### GitHub Actions で .env ファイルを生成する

CI/CD で実際の `.env` ファイルが必要なケース（Next.js のビルド、E2E テスト、Docker ビルドなど）では、age 秘密鍵を GitHub Actions Secret に登録し、`decrypt` → `sync` で `.env` ファイルを生成する。

#### 1. age 秘密鍵を Secret に登録

```bash
# ローカルの age 秘密鍵の内容を確認
cat ~/.config/sops/age/keys.txt
```

GitHub リポジトリの **Settings → Secrets and variables → Actions** で `SOPS_AGE_KEY` として登録する。
（鍵ファイルの中身をそのまま貼り付ける）

#### 2. ワークフローの書き方

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

      # sops と age をインストール
      - name: Install sops and age
        run: |
          curl -Lo /usr/local/bin/sops https://github.com/getsops/sops/releases/download/v3.9.4/sops-v3.9.4.linux.amd64
          chmod +x /usr/local/bin/sops
          curl -Lo age.tar.gz https://github.com/FiloSottile/age/releases/download/v1.2.1/age-v1.2.1-linux-amd64.tar.gz
          tar xf age.tar.gz
          mv age/age /usr/local/bin/
          mv age/age-keygen /usr/local/bin/

      # age 秘密鍵を配置
      - name: Setup age key
        run: |
          mkdir -p ~/.config/sops/age
          echo "${{ secrets.SOPS_AGE_KEY }}" > ~/.config/sops/age/keys.txt

      - run: pnpm install --frozen-lockfile

      # .env.monorepo.staging.sops を復号 → 各アプリに .env を展開
      - name: Generate .env files
        run: |
          npx smonoenv decrypt staging
          npx smonoenv sync staging

      # これ以降、各アプリの .env ファイルが生成された状態でビルド・テストを実行
      - run: pnpm build
      - run: pnpm test
```

#### 3. self-hosted ランナーの場合

self-hosted ランナーでは `sops` / `age` をあらかじめインストールしておけば、鍵の配置ステップだけで済む:

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

#### 4. 環境ごとに使い分ける

GitHub Actions の `environment` と組み合わせて、デプロイ先に応じた `.env` を生成できる:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    steps:
      # ... checkout, setup 省略 ...

      - name: Generate .env files
        run: |
          ENV_NAME=${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
          npx smonoenv decrypt $ENV_NAME
          npx smonoenv sync $ENV_NAME
```

#### 5. セキュリティ: self-hosted ランナーでのクリーンアップ

GitHub-hosted ランナーではジョブ終了後に VM ごと破棄されるため問題ないが、self-hosted ランナーではファイルが残り続ける。`always()` を使って成功・失敗に関わらずクリーンアップする:

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

      # 成功・失敗に関わらず必ず実行
      - name: Cleanup secrets
        if: always()
        run: |
          rm -f ~/.config/sops/age/keys.txt
          rm -f .env.monorepo.*
          find . -name '.env' -not -path './node_modules/*' -delete
          find . -name '.env.*' -not -name '.env.example' -not -path './node_modules/*' -delete
```

## 環境

| 環境名 | 用途 |
|--------|------|
| `local` | ローカル開発 |
| `staging` | ステージング |
| `production` | 本番 |

## ファイル構成

```
.env.monorepo.local           # 平文（.gitignore 推奨）
.env.monorepo.local.sops      # 暗号化済み（Git 管理）
.env.monorepo.staging         # 平文
.env.monorepo.staging.sops    # 暗号化済み
.env.monorepo.production      # 平文
.env.monorepo.production.sops # 暗号化済み
.sops.yaml                    # SOPS の暗号化設定
```

## ライブラリとしての利用

CLI だけでなく、Node.js から直接 import して使うこともできる:

```typescript
import { parseMono, normalize, parseEnvFile } from "@1dot5/smonoenv";
import { sync, decrypt, encrypt } from "@1dot5/smonoenv";
```

## ライセンス

MIT
