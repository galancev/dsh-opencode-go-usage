#!/usr/bin/env bash
# 发布 @galancev/dsh-opencode-go-usage 到 npm。
#
# 默认发布渠道是 GitHub Releases → GitHub Packages（见 docs/RELEASE.md）；
# 本脚本是 npmjs.org 的手动通道，需要本机 2FA 登录。
#
# 用法:
#   ./scripts/publish.sh            # 用 package.json 里的版本直接发布
#   ./scripts/publish.sh patch      # 先升版本(patch/minor/major)再发布
#
# 前置:
#   - 已 `npm login`（发布需要 2FA，必须在本机终端交互完成）
#   - npm scope `@galancev` 已创建（见 docs/RELEASE.md）
set -euo pipefail

cd "$(dirname "$0")/.."

LEVEL="${1:-}"

# 0. 必须已登录
if ! npm whoami >/dev/null 2>&1; then
  echo "✗ 未登录 npm。先执行: npm login" >&2
  echo "  （发布需要浏览器 2FA，无法在无人值守脚本里完成）" >&2
  exit 1
fi
echo "→ npm 用户: $(npm whoami)"

# 1. 可选：升版本
if [ -n "$LEVEL" ]; then
  case "$LEVEL" in
    patch|minor|major) ;;
    *) echo "usage: $0 [patch|minor|major]" >&2; exit 1 ;;
  esac
  NEW_VERSION="$(npm version "$LEVEL" --no-git-tag-version)"
  git add package.json
  git commit -m "chore: release $NEW_VERSION"
  echo "→ bump: $NEW_VERSION"
fi

VERSION="$(node -p "require('./package.json').version")"
PKG="$(node -p "require('./package.json').name")"
REPO="$(node -p "require('./package.json').repository")"

# 2. 回归门禁：lib/index.js 的 RELEASE_REPO 必须与 package.json 的 repository 一致
#    （更新检查用它查 GitHub Releases，改名后忘了同步会永远查不到新版本）
SLUG="${REPO#github:}"
if ! grep -q "const RELEASE_REPO = \"$SLUG\";" lib/index.js; then
  echo "✗ lib/index.js 的 RELEASE_REPO 与 package.json 的 repository 不一致" >&2
  grep -n 'const RELEASE_REPO' lib/index.js >&2
  echo "  期望: const RELEASE_REPO = \"$SLUG\";" >&2
  exit 1
fi
echo "→ RELEASE_REPO 与仓库一致: $SLUG"

# 3. 语法自检
node --check lib/index.js
node --check lib/client.js
node --check lib/opencode-session.js
echo "→ 语法检查通过"

# 4. 打包清单预览
echo "→ 打包清单:"
npm pack --dry-run 2>&1 | sed -n '/Tarball Contents/,/Tarball Details/p'

# 5. 发布（publishConfig.access=public 已在 package.json 声明）
npm publish

echo ""
echo "✓ 已发布 $PKG@$VERSION"
echo "  https://www.npmjs.com/package/$PKG"
echo ""
echo "记得把代码与 tag 推上去，并建一个 GitHub Release:"
echo "  git push origin main && git tag v$VERSION && git push origin v$VERSION"
echo "  Release 会触发 GitHub Packages 发布，也是更新检查读到的唯一来源"
