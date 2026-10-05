#!/usr/bin/env bash
# Cut a release: gate, bump package.json, move CHANGELOG "Unreleased" into a version section, commit, tag.
# Usage: scripts/release.sh patch|minor|major
# Nothing is pushed. Pushing the v* tag runs .github/workflows/publish.yml (Marketplace + Open VSX).
set -euo pipefail

bump=${1:-patch}
changelog=docs/CHANGELOG.md

die() { echo "release: $*" >&2; exit 1; }

case "$bump" in patch | minor | major) ;; *) die "BUMP must be patch, minor or major (got '$bump')" ;; esac

cd "$(git rev-parse --show-toplevel)"

[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "not on main"
[ -z "$(git status --porcelain)" ] || die "working tree not clean; commit or stash first"

# --- next version -----------------------------------------------------------
last=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)
if [ -z "$last" ]; then
  next=v0.1.0
else
  IFS=. read -r major minor patch <<<"${last#v}"
  case "$bump" in
    major) next=v$((major + 1)).0.0 ;;
    minor) next=v$major.$((minor + 1)).0 ;;
    patch) next=v$major.$minor.$((patch + 1)) ;;
  esac
fi
! git rev-parse -q --verify "refs/tags/$next" >/dev/null || die "tag $next already exists"

# --- gates ------------------------------------------------------------------
pre-commit run --all-files || die "pre-commit failed"
[ -z "$(git status --porcelain)" ] || die "pre-commit modified files; review, commit, retry"
./scripts/ddd/ddd check
npm run lint
npm run test:unit
AVE_REQUIRE_ANSIBLE=1 npm run test:integration

# --- changelog and version --------------------------------------------------
grep -qx '## Unreleased' "$changelog" || die "$changelog has no '## Unreleased' section"
entries=$(awk '/^## /{s = ($0 == "## Unreleased"); next} s && /^- /{n++} END{print n+0}' "$changelog")
[ "$entries" -gt 0 ] || die "nothing to release: add entries under '## Unreleased' in $changelog"

files=("$changelog" package.json)
[ ! -f package-lock.json ] || files+=(package-lock.json)
trap 'echo "release: failed; undo with: git checkout ${files[*]}" >&2' ERR
heading="## $next ($(date +%F))"
tmp=$(mktemp)
awk -v h="$heading" '{print} $0 == "## Unreleased"{print ""; print h}' "$changelog" >"$tmp"
mv "$tmp" "$changelog"
grep -qxF "$heading" "$changelog" || die "version heading missing from $changelog"

# The publish workflow requires the tag to equal v<package.json version>.
[ "$(node -p "require('./package.json').version")" = "${next#v}" ] ||
  npm version "${next#v}" --no-git-tag-version >/dev/null

# --- commit and tag ---------------------------------------------------------
git add "${files[@]}"
pre-commit run --files "${files[@]}" || { git add "${files[@]}"; pre-commit run --files "${files[@]}"; }
git commit -m "release $next"
git tag -a "$next" -m "$next"
trap - ERR

echo "Released $next. Next: git push --follow-tags (the tag publishes to the Marketplace and Open VSX)"
