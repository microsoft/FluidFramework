#!/usr/bin/env bash
# cspell:ignore ACMR toplevel
#
# CI Readiness Check — quick pre-push sanity check for Fluid Framework.
#
# Detects which packages changed vs a base branch, then:
#   1. Auto-fixes formatting (Biome) in each changed package
#   2. Runs policy check (flub) scoped to changed packages, with auto-fix
#   3. Checks if a changeset is present
#   4. Reports uncommitted changes, build status, and a summary
#
# Designed to be run by the ci-readiness-check skill, which handles
# build-dependent checks (API reports, ESLint, type tests) after this script.

# Exit on any error, undefined variable, or pipe failure.
set -euo pipefail

# Resolve the repo root (works from any directory) and accept an optional
# base branch argument, defaulting to "main".
REPO_ROOT="$(git rev-parse --show-toplevel)"
BASE_BRANCH="${1:-main}"

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
section "Detecting changed packages (vs ${BASE_BRANCH})"

# Verify the base branch exists. Try the bare name first, then origin/<name>.
if ! git rev-parse --verify "${BASE_BRANCH}" &>/dev/null; then
    if ! git rev-parse --verify "origin/${BASE_BRANCH}" &>/dev/null; then
        fail "Base branch '${BASE_BRANCH}' not found locally or as origin/${BASE_BRANCH}"
        exit 1
    fi
    BASE_BRANCH="origin/${BASE_BRANCH}"
fi

# Find the common ancestor between HEAD and the base branch, then list all
# files that were Added, Copied, Modified, or Renamed since that point.
MERGE_BASE="$(git merge-base HEAD "${BASE_BRANCH}" 2>/dev/null || echo "${BASE_BRANCH}")"
CHANGED_FILES="$(git diff "${MERGE_BASE}" --name-only --diff-filter=ACMR)"

# If nothing changed, there's nothing to check.
if [ -z "${CHANGED_FILES}" ]; then
    ok "No files changed vs ${BASE_BRANCH}. Nothing to check."
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

# ---------- Phase 1: Format ----------
section "Formatting changed packages"

# For each changed package that has a "format" script in its package.json,
# run it. This invokes Biome to auto-fix formatting issues in-place.
FORMATTED=0
FORMAT_ERRORS=0
for pkg in "${PACKAGES[@]}"; do
    pkg_dir="${REPO_ROOT}/${pkg}"
    # Use node to check if the package.json has a "format" script.
    has_format=$(cd "${pkg_dir}" && node -p "Boolean(require('./package.json').scripts?.format)" 2>/dev/null || echo "false")
    if [ "${has_format}" = "true" ]; then
        if (cd "${pkg_dir}" && pnpm run format 2>&1) >/dev/null 2>&1; then
            ok "Formatted ${pkg}"
            FORMATTED=$((FORMATTED + 1))
        else
            fail "Format failed in ${pkg}"
            FORMAT_ERRORS=$((FORMAT_ERRORS + 1))
        fi
    fi
done

# If no packages had a format script at all, note that.
if [ ${FORMATTED} -eq 0 ] && [ ${FORMAT_ERRORS} -eq 0 ]; then
    ok "No packages have a format script"
fi

# ---------- Phase 2: Policy check ----------
section "Running policy check on changed packages"

# Build a regex that matches any of the changed package paths. This is passed
# to flub's --path flag to scope the policy check to only these packages.
PATH_REGEX=""
for pkg in "${PACKAGES[@]}"; do
    if [ -n "${PATH_REGEX}" ]; then
        PATH_REGEX="${PATH_REGEX}|"
    fi
    PATH_REGEX="${PATH_REGEX}${pkg}"
done

# Run policy check with --fix first to auto-fix what it can (e.g., copyright
# headers, package.json sorting), then run again without --fix to verify.
POLICY_OK=true
(cd "${REPO_ROOT}" && pnpm flub check policy --fix --path "${PATH_REGEX}" 2>&1) >/dev/null 2>&1 || true
(cd "${REPO_ROOT}" && pnpm flub check policy --path "${PATH_REGEX}" 2>&1) >/dev/null 2>&1 || POLICY_OK=false

if [ "${POLICY_OK}" = true ]; then
    ok "Policy check passed"
else
    fail "Policy check has issues. Re-run for details: pnpm flub check policy --path \"${PATH_REGEX}\""
fi

# ---------- Phase 3: Changeset check ----------
section "Checking for changeset"

# Check if a changeset file exists for this branch. Changesets are required
# when modifying published package source code. The check compares against
# the base branch to see if any changeset files were added.
CHANGESET_OK=true
(cd "${REPO_ROOT}" && pnpm flub check changeset --branch "${BASE_BRANCH}" 2>&1) >/dev/null 2>&1 || CHANGESET_OK=false

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

if [ "${POLICY_OK}" != true ]; then
    fail "Policy check has remaining issues — see above"
fi

if [ "${CHANGESET_OK}" != true ]; then
    warn "Changeset may be needed — run 'pnpm changeset' if this PR modifies published packages"
fi

if [ ${#NOT_BUILT[@]} -gt 0 ]; then
    warn "${#NOT_BUILT[@]} package(s) not built — build-dependent checks (API reports, ESLint, type tests) require a build first"
fi

echo ""
echo "Script complete. The agent will now handle build-dependent checks (API reports, ESLint, type tests)."
