# 发布流程（维护者）

> 仓库：`galancev/dsh-opencode-go-usage`，发布为 scoped 包名
> **`@galancev/dsh-opencode-go-usage`**。

## 发布渠道

| 渠道 | 触发 | 认证 | 用途 |
|---|---|---|---|
| GitHub Packages | 创建 GitHub Release（或手动 Run workflow） | 工作流自带 `GITHUB_TOKEN` | 默认自动路径，无需任何 secret |
| npmjs.org | `./scripts/publish.sh` 手动发布 | 本机 `npm login` + 2FA | 可选，普通用户安装更省事 |
| npmjs.org（CI） | 仓库变量 `NPMJS_TRUSTED_PUBLISHING=true` | OIDC trusted publishing | 可选，需先在 npmjs 配置 trusted publisher |

更新检查读的是 **GitHub Releases**（`https://api.github.com/repos/galancev/dsh-opencode-go-usage/releases/latest`），
所以每次发版都要建 Release（tag 形如 `v1.6.1`）；只推 tag 不建 Release，卡片上的新版提示不会出现。

## 一次性配置

scope `@galancev` 在 npmjs 上**尚未创建**（包名也尚未占用），若要走 npmjs 渠道，先去
<https://www.npmjs.com/> → 头像 → **Add Organization**，Name 填 `galancev`，Plan 选
**Free / Unlimited public packages**。

核对方式：

```bash
# scope 是否存在（不存在时 404）
curl -s -o /dev/null -w '%{http_code}\n' https://registry.npmjs.org/-/org/galancev/user

# 包名是否仍可用（尚未发布时应为 404）
curl -s -o /dev/null -w '%{http_code}\n' 'https://registry.npmjs.org/@galancev%2Fdsh-opencode-go-usage'
```

`package.json` 已声明 `"publishConfig": { "access": "public" }`，所以 scoped 包会以公开
方式发布，不需要每次加 `--access public`。

## 日常发版

一键（npmjs 渠道，推荐先在本地跑一遍再建 Release）：

```bash
npm login                     # 首次或凭据过期时
./scripts/publish.sh          # 用当前版本发布
./scripts/publish.sh patch    # 或先升版本（minor / major 同理）再发布
```

`scripts/publish.sh` 会依次做：校验已登录 → 可选升版本并提交 →
**校验 `lib/index.js` 的 `RELEASE_REPO` 与 `package.json` 的 `repository` 一致**
（更新检查用它查 GitHub Releases，写错会永远查不到新版本）→ 三个 lib 文件语法自检 →
打印打包清单 → `npm publish`。

手动等价步骤：

```bash
npm login
npm whoami            # 应打印你的用户名

npm version patch --no-git-tag-version     # 或 minor / major
git add package.json && git commit -m "chore: release vX.Y.Z"

npm publish           # publishConfig.access=public 已在 package.json 声明

git push origin main
git tag vX.Y.Z && git push origin vX.Y.Z
```

发布前自检：

- `lib/index.js` 的 `RELEASE_REPO` 必须与 `package.json` 的 `repository` 一致；
- `package.json` 的 `files` 决定打包内容（当前为 `lib` + `cordis.patch.yml` + `README.ru.md`），
  改了目录结构要同步；
- `npm pack --dry-run` 看清单。

## GitHub Packages（自动，无需 token）

每个 Release 也会自动发布到 GitHub Packages，由
[`.github/workflows/release-package.yml`](../.github/workflows/release-package.yml)
完成：`release: created` 触发（另加 `workflow_dispatch` 便于手动重跑），用工作流自带的
`GITHUB_TOKEN`（`packages: write`）发布。**不需要任何 secret。**

- **手动重跑**：Actions → Node.js Package → Run workflow。已发布过的版本会被跳过
  （先 `npm view` 查一次，命中就直接 exit 0），不会报红。
- **registry 只在 CI 里映射**：setup-node 按仓库 owner 推导出
  `@galancev:registry=https://npm.pkg.github.com/`，默认 registry 仍是 npmjs.org。
  仓库里**刻意不放** `.npmrc` —— 那会把这个 scope 的 `npm publish` 也劫持到
  GitHub Packages，破坏本地 npmjs 发布流程。
- **首次发布后要手动改可见性**：包默认 private，改 public 的位置是
  `https://github.com/users/galancev/packages/npm/dsh-opencode-go-usage/settings`
  → Danger Zone → Change visibility。
- GitHub Packages 即使对公开包也**要求认证**（PAT + `read:packages`），普通用户安装仍建议
  用仓库 checkout（`dsh plugin add link:...`）。

## 可选：npmjs 走 CI

在 npmjs 上给本包配置 trusted publisher（仓库 `galancev/dsh-opencode-go-usage`，
工作流文件 `release-package.yml`），再把仓库变量 `NPMJS_TRUSTED_PUBLISHING` 设为 `true`；
那之后 `publish-npmjs` 作业才会参与发布（默认跳过，不会让 Release 变红）。

## 为什么不用 NPM_TOKEN

- npm 已于 2025-11-19 **永久吊销全部 classic token**，生成入口同时关闭 ——
  已无法再创建「Automation 类型 token」。
- granular token 的写权限最长 90 天；2026-07-31 起 bypass-2FA 的 granular token
  又被进一步限制。secret 方案必须定期轮换，不换就会在某天突然发不出去。

**注意**：npm 发布需要 2FA（浏览器 WebAuthn），无法在无人值守的脚本/Agent 里完成，
必须由维护者本人在终端执行 `npm login` + `npm publish`。
