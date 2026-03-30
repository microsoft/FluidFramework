#!/usr/bin/env bash
# cspell:ignore ACMR toplevel
#
# CI Readiness Check — quick pre-push sanity check for Fluid Framework.
#
# Usage: ci-readiness-check.sh [--quick] [base-branch]
#
# Detects which packages changed vs a base branch, then:
#   --quick mode: formats changed files with Biome only (fast)
#   default mode: runs full `fluid-build --task checks:fix` scoped to
#     changed packages (formatting, policy, syncpack, versions) + verifies
#   Both modes: check changeset, report uncommitted changes and build status
#
# Designed to be run by the ci-readiness-check skill, which handles
# build-dependent checks (API reports, ESLint, type tests) after this script.

# Exit on any error, undefined variable, or pipe failure.
set -euo pipefail

# Resolve the repo root (works from any directory) and parse arguments.
# Accepts an optional --quick flag and an optional base branch (default: main).
REPO_ROOT="$(git rev-parse --show-toplevel)"
QUICK_MODE=false
BASE_BRANCH="main"

for arg in "$@"; do
    case "${arg}" in
        --quick) QUICK_MODE=true ;;
        *) BASE_BRANCH="${arg}" ;;
    esac
done

# --- Output helpers ---
# ANSI color codes for colored terminal output.
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Shorthand functions for printing section headers, success, warning, and
# failure messages with color and unicode indicators.
section() { echo -e "\n${BLUE}=== $1 ===${NC}"; }
ok()      { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC} $1"; }
fail()    { echo -e "${RED}✗${NC} $1"; }

# Read a package's name from its package.json, falling back to the directory
# path if node isn't available or the read fails.
get_pkg_name() {
    (cd "${REPO_ROOT}/$1" && node -p "require('./package.json').name" 2>/dev/null) || echo "$1"
}

# ---------- Phase 0: Detect changed files and packages ----------

# Verify the base branch exists. Try the bare name first, then origin/<name>.
# BASE_BRANCH_NAME stays as the bare name (for flub, which prepends origin/ internally).
# BASE_BRANCH_REF is the resolved git ref (for git diff/merge-base).
BASE_BRANCH_NAME="${BASE_BRANCH}"
if git rev-parse --verify "${BASE_BRANCH}" &>/dev/null; then
    BASE_BRANCH_REF="${BASE_BRANCH}"
elif git rev-parse --verify "origin/${BASE_BRANCH}" &>/dev/null; then
    BASE_BRANCH_REF="origin/${BASE_BRANCH}"
else
    fail "Base branch '${BASE_BRANCH}' not found locally or as origin/${BASE_BRANCH}"
    exit 1
fi

section "Detecting changed packages (vs ${BASE_BRANCH_NAME})"

# Find the common ancestor between HEAD and the base branch, then list all
# files that were Added, Copied, Modified, or Renamed since that point.
MERGE_BASE="$(git merge-base HEAD "${BASE_BRANCH_REF}" 2>/dev/null || echo "${BASE_BRANCH_REF}")"
CHANGED_FILES="$(git diff "${MERGE_BASE}" --name-only --diff-filter=ACMR)"

# If nothing changed, there's nothing to check.
if [ -z "${CHANGED_FILES}" ]; then
    ok "No files changed vs ${BASE_BRANCH_NAME}. Nothing to check."
    exit 0
fi

# Print the list of changed files, truncating at 20 for readability.
TOTAL_FILES="$(echo "${CHANGED_FILES}" | wc -l | tr -d ' ')"
echo "${CHANGED_FILES}" | head -20
if [ "${TOTAL_FILES}" -gt 20 ]; then
    echo "... and $((TOTAL_FILES - 20)) more files"
fi

# For each changed file, walk up the directory tree to find the nearest
# package.json (skipping the repo root's package.json). This maps each file
# to the monorepo package it belongs to. An associative array deduplicates.
declare -A CHANGED_PACKAGES_MAP=()
while IFS= read -r file; do
    d="$(dirname "${REPO_ROOT}/${file}")"
    while [ "${d}" != "${REPO_ROOT}" ] && [ "${d}" != "/" ]; do
        if [ -f "${d}/package.json" ] && [ "${d}" != "${REPO_ROOT}" ]; then
            rel="${d#"${REPO_ROOT}"/}"
            CHANGED_PACKAGES_MAP["${rel}"]=1
            break
        fi
        d="$(dirname "${d}")"
    done
done <<< "${CHANGED_FILES}"

# Convert the associative array keys into a sorted regular array.
PACKAGES=()
if [ ${#CHANGED_PACKAGES_MAP[@]} -gt 0 ]; then
    for pkg in "${!CHANGED_PACKAGES_MAP[@]}"; do
        PACKAGES+=("${pkg}")
    done
    mapfile -t PACKAGES < <(printf '%s\n' "${PACKAGES[@]}" | sort)
fi

# If no changed files mapped to a package (e.g., only root config changed),
# report and exit — there are no packages to check.
if [ ${#PACKAGES[@]} -eq 0 ]; then
    warn "Changed files don't belong to any package. Only root-level files changed."
    echo "Changed files:"
    echo "${CHANGED_FILES}"
    echo ""
    echo "Done. No packages to check."
    exit 0
fi

# Print the list of changed packages with their npm names.
echo ""
echo "Changed packages (${#PACKAGES[@]}):"
for pkg in "${PACKAGES[@]}"; do
    echo "  - $(get_pkg_name "${pkg}") (${pkg})"
done

# Check which packages have been built (have a lib/ or dist/ output directory)
# vs which haven't. The agent uses this to decide whether to offer building them.
BUILT=()
NOT_BUILT=()
for pkg in "${PACKAGES[@]}"; do
    if [ -d "${REPO_ROOT}/${pkg}/lib" ] || [ -d "${REPO_ROOT}/${pkg}/dist" ]; then
        BUILT+=("${pkg}")
    else
        NOT_BUILT+=("${pkg}")
    fi
done

# Warn about any packages that aren't built yet.
if [ ${#NOT_BUILT[@]} -gt 0 ]; then
    echo ""
    warn "Not yet built (no lib/ or dist/ directory):"
    for pkg in "${NOT_BUILT[@]}"; do
        echo "    $(get_pkg_name "${pkg}") (${pkg})"
    done
fi

# ---------- Phase 0.5: Ensure dependencies are installed ----------
if [ ! -d "${REPO_ROOT}/node_modules" ]; then
    section "Installing dependencies"
    warn "node_modules not found — running pnpm install"
    (cd "${REPO_ROOT}" && pnpm install --frozen-lockfile 2>&1) || {
        fail "pnpm install failed. Install dependencies manually and re-run."
        exit 1
    }
    ok "Dependencies installed"
fi

# Build the package list as space-separated paths for fluid-build.
PKG_ARGS=""
for pkg in "${PACKAGES[@]}"; do
    PKG_ARGS="${PKG_ARGS} ${pkg}"
done

CHECKS_FIX_OK=true
CHECKS_OK=true

if [ "${QUICK_MODE}" = true ]; then
    # ---------- Phase 1 (Quick): Format changed files only ----------
    section "Formatting changed files (Quick mode)"

    # Collect only formattable files from the changed list and run biome
    # format --write on them directly. This avoids the slower repo-wide
    # policy checks and lint that checks:fix would trigger.
    FORMAT_FILES=()
    while IFS= read -r file; do
        case "${file}" in
            *.ts|*.tsx|*.js|*.jsx|*.json|*.jsonc|*.css) FORMAT_FILES+=("${REPO_ROOT}/${file}") ;;
        esac
    done <<< "${CHANGED_FILES}"

    if [ ${#FORMAT_FILES[@]} -gt 0 ]; then
        echo "Formatting ${#FORMAT_FILES[@]} changed file(s) with Biome..."
        if (cd "${REPO_ROOT}" && pnpm exec biome format --write "${FORMAT_FILES[@]}" 2>&1); then
            ok "Formatting complete"
        else
            warn "Biome formatting had issues"
            CHECKS_FIX_OK=false
        fi
    else
        ok "No formattable files changed"
    fi

    echo ""
    warn "Quick mode: skipped policy, syncpack, version checks, and lint"
else
    # ---------- Phase 1 (Full/Thorough): Auto-fix all checks ----------
    section "Running checks:fix on changed packages"

    # Use fluid-build --task checks:fix scoped to just the changed packages.
    # This runs: biome format --write, flub check policy --fix, syncpack fix,
    # and buildVersion --fix — all in the correct dependency order.
    echo "Running: fluid-build --task checks:fix ${PKG_ARGS}"
    if (cd "${REPO_ROOT}" && pnpm exec fluid-build --task checks:fix ${PKG_ARGS} 2>&1); then
        ok "checks:fix completed"
    else
        warn "checks:fix had issues (some fixes may still have been applied)"
        CHECKS_FIX_OK=false
    fi

    # ---------- Phase 2: Verify checks pass ----------
    section "Verifying checks pass"

    if (cd "${REPO_ROOT}" && pnpm exec fluid-build --task checks ${PKG_ARGS} 2>&1) >/dev/null 2>&1; then
        ok "All checks pass"
    else
        CHECKS_OK=false
        fail "Some checks still failing after auto-fix. Re-run for details: pnpm exec fluid-build --task checks ${PKG_ARGS}"
    fi
fi

# ---------- Phase 3: Changeset check ----------
section "Checking for changeset"

# Changeset check is not part of the checks/checks:fix tasks, so run it
# separately. Changesets are required when modifying published package source.
CHANGESET_OK=true
(cd "${REPO_ROOT}" && pnpm flub check changeset --branch "${BASE_BRANCH_NAME}" 2>&1) >/dev/null 2>&1 || CHANGESET_OK=false

if [ "${CHANGESET_OK}" = true ]; then
    ok "Changeset check passed (changeset present or not required)"
else
    warn "No changeset found. If this PR modifies published package code, you may need one."
    echo "  Run: pnpm changeset"
fi

# ---------- Phase 4: Uncommitted changes ----------
section "Checking for uncommitted changes"

# Run git status and categorize the results into three buckets:
# API reports, type test files, and everything else. This helps the user
# understand which uncommitted files are generated vs their own changes.
GIT_STATUS=$(cd "${REPO_ROOT}" && git status --short)
if [ -n "${GIT_STATUS}" ]; then
    API_REPORTS=$(echo "${GIT_STATUS}" | grep "api-report/" || true)
    TYPE_TESTS=$(echo "${GIT_STATUS}" | grep "validate.*Previous.*generated" || true)
    OTHER_CHANGES=$(echo "${GIT_STATUS}" | grep -v "api-report/" | grep -v "validate.*Previous.*generated" || true)

    if [ -n "${OTHER_CHANGES}" ]; then
        warn "Uncommitted changes:"
        echo "${OTHER_CHANGES}" | head -20
    fi
    if [ -n "${API_REPORTS}" ]; then
        warn "Modified API report files (may need staging):"
        echo "${API_REPORTS}" | head -10
    fi
    if [ -n "${TYPE_TESTS}" ]; then
        warn "Modified type test files (may need staging):"
        echo "${TYPE_TESTS}" | head -10
    fi
else
    ok "Working tree clean"
fi

# ---------- Summary ----------
section "Summary"

# Print a quick overview of counts and any issues found.
echo "Changed packages: ${#PACKAGES[@]}"
echo "Built: ${#BUILT[@]}, Not built: ${#NOT_BUILT[@]}"
echo ""

# Recap each issue category so the user doesn't have to scroll up.
if [ -n "${GIT_STATUS}" ]; then
    CHANGE_COUNT="$(echo "${GIT_STATUS}" | wc -l | tr -d ' ')"
    warn "${CHANGE_COUNT} file(s) with uncommitted changes — review and stage as needed"
else
    ok "No uncommitted changes"
fi

if [ "${CHECKS_OK}" != true ]; then
    fail "Some checks still failing after auto-fix — see above"
fi

if [ "${CHANGESET_OK}" != true ]; then
    warn "Changeset may be needed — run 'pnpm changeset' if this PR modifies published packages"
fi

if [ ${#NOT_BUILT[@]} -gt 0 ]; then
    warn "${#NOT_BUILT[@]} package(s) not built — build-dependent checks (API reports, ESLint, type tests) require a build first"
fi

# Exit non-zero if checks or formatting failed, so this script can be used
# in automation (e.g. pre-push hooks). Missing changeset is a warning only.
EXIT_CODE=0
if [ "${CHECKS_FIX_OK}" != true ] || [ "${CHECKS_OK}" != true ]; then
    EXIT_CODE=1
fi

echo ""
echo "Script complete. The agent will now handle build-dependent checks (API reports, ESLint, type tests)."
exit "${EXIT_CODE}"
