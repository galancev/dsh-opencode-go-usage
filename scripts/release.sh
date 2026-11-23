#!/usr/bin/env bash
# Release helper: bump version, commit, tag, push.
#
# The pushed tag alone publishes nothing — create a GitHub Release for it
# (`gh release create vX.Y.Z`), and release-package.yml publishes the version
# to GitHub Packages. The plugin's update check reads that same Release.
# See docs/RELEASE.md.
#
# Usage:
#   ./scripts/release.sh          # patch: 1.3.0 -> 1.3.1
#   ./scripts/release.sh minor    # minor: 1.3.0 -> 1.4.0
#   ./scripts/release.sh major    # major: 1.3.0 -> 2.0.0
#
# Prerequisites:
#   - repo has an `origin` remote (git@github.com:galancev/dsh-opencode-go-usage.git)
set -euo pipefail

LEVEL="${1:-patch}"
case "$LEVEL" in
  patch|minor|major) ;;
  *) echo "usage: $0 [patch|minor|major]" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."

# 1. bump version in package.json (no git tag yet — we tag ourselves)
NEW_VERSION="$(npm version "$LEVEL" --no-git-tag-version)"
echo "→ bump: $NEW_VERSION"

# 2. commit the version bump
git add package.json package-lock.json
git commit -m "chore: release $NEW_VERSION"

# 3. tag and push
git tag "$NEW_VERSION"
git push origin main
git push origin "$NEW_VERSION"

echo "✓ released $NEW_VERSION"
echo "  next: create the GitHub Release (it publishes to GitHub Packages):"
echo "  gh release create v$NEW_VERSION --generate-notes"
echo "  watch: https://github.com/galancev/dsh-opencode-go-usage/actions"
