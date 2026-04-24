#!/usr/bin/env python3
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

"""detect_changed_packages.

Decides whether a PR's diff warrants scoping downstream test execution to a
subset of workspace packages. Emits two ADO output variables:

    shouldRunTests    "true" | "false"  — whether any test work is needed
    scopedPnpmFilter  pnpm filter string "...[<sha>]" when scoping is active,
                      empty when a full test run is required. Downstream jobs
                      pass this verbatim into ``npm_config_filter``; pnpm treats
                      an empty value as "no filter applied" so recursive ``-r``
                      runs fall back to the historical every-package behavior.

Safe-fallback policy: any unexpected error (missing merge-base, git failure,
unparseable ref) MUST result in a full run — never a silent skip. An
accidental silent skip would suppress all tests and hide real regressions.

Why merge-base (and not just ``origin/<branch>`` directly): pnpm's
``--filter "[ref]"`` uses a two-dot diff internally (see pnpm/pnpm#9907), so
commits that landed on ``origin/<branch>`` after this PR diverged would show
up as "changed." Computing the merge-base SHA ourselves and feeding that SHA
into the selector gives three-dot (merge-base) semantics.

This module exports pure helpers so the decision logic can be unit tested
without an ADO pipeline context or a populated git repo. Python stdlib only
(no third-party deps) so the pipeline gate stays close to "git + python" fast.
"""

from __future__ import annotations

import os
import posixpath
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable, Iterable

# Full-run trigger patterns. A diff touching any of these paths forces running
# every package's tests (filter stays empty → pnpm -r runs across the whole
# workspace). Keep this list conservative — it's the safety net for changes
# that could plausibly invalidate assumptions across the entire workspace.
#
# This list partially overlaps with `pr: paths: include:` in
# tools/pipelines/build-client.yml (which decides whether the pipeline runs
# at all). The concepts differ — one gates the pipeline, the other gates
# scoping within a pipeline that's already running — but adding a new
# cross-cutting root-level file generally warrants updating both. There's no
# programmatic link, so keep them in sync by convention.
FULL_RUN_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^package\.json$"),
    re.compile(r"^pnpm-lock\.yaml$"),
    re.compile(r"^pnpm-workspace\.yaml$"),
    re.compile(r"^\.pnpmfile\.cjs$"),
    re.compile(r"^\.npmrc$"),
    re.compile(r"^\.nvmrc$"),
    re.compile(r"^fluidBuild\.config\.cjs$"),
    re.compile(r"^tsconfig[^/]*\.json$"),
    re.compile(r"^biome\."),
    re.compile(r"^tools/"),
    re.compile(r"^common/"),
    re.compile(r"^scripts/"),
    re.compile(r"^\.changeset/config\.json$"),
)


def normalize_target_branch(branch: str) -> str:
    """Azure Repos emits ``refs/heads/main``; GitHub emits just ``main``. Normalize."""
    if branch.startswith("refs/heads/"):
        return branch[len("refs/heads/") :]
    return branch


def check_full_run_patterns(
    files: Iterable[str],
    patterns: Iterable[re.Pattern[str]] = FULL_RUN_PATTERNS,
) -> re.Pattern[str] | None:
    """Return the first pattern that any of the given files match, or ``None``.

    Used by callers to surface *why* a full run was forced.
    """
    file_list = list(files)
    for pattern in patterns:
        if any(pattern.search(f) for f in file_list):
            return pattern
    return None


def build_package_dir_set(
    merge_base: str,
    list_historical_packages: Callable[[str], Iterable[str]],
    list_current_packages: Callable[[], Iterable[str]],
) -> set[str]:
    """Build the set of directories that hold (or held, at ``merge_base``) a package.json.

    Unions the merge-base tree with the working tree so a package DELETED on
    this branch still maps correctly — the reviewer-flagged case the bash
    implementation missed.

    ``list_historical_packages`` and ``list_current_packages`` are injected so
    tests can drive this logic without spinning up a real git repo.
    """
    dirs: set[str] = set()

    def record(file: str) -> None:
        # file is like "packages/foo/package.json" or "package.json".
        d = posixpath.dirname(file)
        dirs.add("." if d == "" else d)

    for f in list_historical_packages(merge_base):
        record(f)
    for f in list_current_packages():
        record(f)
    return dirs


def find_changed_packages(
    changed_files: Iterable[str],
    package_dirs: set[str],
) -> bool:
    """Return True if any changed file lives under a known package directory.

    A file at ``packages/foo/src/x.ts`` matches if ``packages/foo`` (or any
    ancestor above it, stopping at the root) is in ``package_dirs``.

    The root pseudo-dir ``"."`` is deliberately ignored here: root-level
    package changes are already caught by ``FULL_RUN_PATTERNS`` and should not
    double-count as a per-package signal.
    """
    for file in changed_files:
        if not file:
            continue
        d = posixpath.dirname(file)
        while d not in (".", "/", ""):
            if d in package_dirs:
                return True
            d = posixpath.dirname(d)
    return False


def _git(args: list[str]) -> str | None:
    """Thin wrapper for ``git`` calls. Returns stdout or None on failure."""
    try:
        result = subprocess.run(
            ["git", *args],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    return result.stdout


def _git_historical_packages(ref: str) -> list[str]:
    """Git-backed implementation of ``list_historical_packages``."""
    out = _git(["ls-tree", "-r", "--name-only", ref])
    if out is None:
        return []
    pattern = re.compile(r"(^|/)package\.json$")
    return [f for f in out.split("\n") if pattern.search(f)]


def _current_packages(cwd: str | None = None) -> list[str]:
    """Walk the working tree for package.json files, skipping node_modules."""
    root = Path(cwd) if cwd is not None else Path.cwd()
    results: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        # Mutate dirnames in place to prune traversal.
        dirnames[:] = [
            d for d in dirnames if d != "node_modules" and not d.startswith(".git")
        ]
        if "package.json" in filenames:
            rel = os.path.relpath(os.path.join(dirpath, "package.json"), root)
            results.append(rel.replace(os.sep, "/"))
    return results


def _emit_vso_outputs(should_run_tests: bool, scoped_pnpm_filter: str) -> None:
    flag = "true" if should_run_tests else "false"
    print(f"shouldRunTests={flag}")
    print(f"scopedPnpmFilter={scoped_pnpm_filter}")
    print(f"##vso[task.setvariable variable=shouldRunTests;isOutput=true]{flag}")
    print(
        f"##vso[task.setvariable variable=scopedPnpmFilter;isOutput=true]{scoped_pnpm_filter}"
    )


def _log_warning(message: str) -> None:
    print(f"##vso[task.logissue type=warning]{message}")


def main() -> None:
    """Pipeline entry point. Reads TARGET_BRANCH from env, writes vso outputs."""
    raw = os.environ.get("TARGET_BRANCH", "")
    target_branch = normalize_target_branch(raw)
    if not target_branch:
        _log_warning("TARGET_BRANCH not set; falling back to full test run.")
        _emit_vso_outputs(True, "")
        return
    print(f"Target branch: {target_branch}")

    if _git(["fetch", "origin", target_branch]) is None:
        _log_warning(
            f"Could not fetch origin/{target_branch}; falling back to full test run."
        )
        _emit_vso_outputs(True, "")
        return

    # Try to resolve the merge-base in the shallow clone first. If the PR
    # diverged further back than the shallow boundary, unshallow and retry
    # once. `.git/shallow` is how git marks a shallow repo; skip the
    # unshallow on a full clone (which would error with "--unshallow on a
    # complete repository").
    mb = _git(["merge-base", "HEAD", f"origin/{target_branch}"])
    merge_base = mb.strip() if mb else ""
    git_dir_out = _git(["rev-parse", "--git-dir"])
    git_dir = git_dir_out.strip() if git_dir_out else ""
    if not merge_base and git_dir and (Path(git_dir) / "shallow").exists():
        print("Merge-base not found in shallow clone; unshallowing and retrying.")
        _git(["fetch", "--unshallow", "origin", target_branch])
        mb = _git(["merge-base", "HEAD", f"origin/{target_branch}"])
        merge_base = mb.strip() if mb else ""
    if not merge_base:
        _log_warning(
            f"No merge-base with origin/{target_branch}; falling back to full test run."
        )
        _emit_vso_outputs(True, "")
        return
    print(f"Merge base: {merge_base}")

    # On diff failure, fall back to a full run rather than swallowing the
    # error — an empty changed-files list would bypass the full-run patterns
    # and the package-change check, silently suppressing all test jobs.
    diff_out = _git(["diff", "--name-only", merge_base])
    if diff_out is None:
        _log_warning(
            f"git diff against merge-base {merge_base} failed; falling back to full test run."
        )
        _emit_vso_outputs(True, "")
        return
    changed_files = [f for f in diff_out.split("\n") if f]
    print(f"Changed files ({len(changed_files)}):")
    for f in changed_files[:30]:
        print(f)
    if len(changed_files) > 30:
        print(f"... and {len(changed_files) - 30} more")

    match = check_full_run_patterns(changed_files)
    if match is not None:
        print(f"Match for full-run pattern '{match.pattern}' — forcing full test run.")
        _emit_vso_outputs(True, "")
        return

    package_dirs = build_package_dir_set(
        merge_base, _git_historical_packages, _current_packages
    )
    if not find_changed_packages(changed_files, package_dirs):
        # Most aggressive skip path: no test jobs run. Surface as a pipeline
        # warning (not plain console output) and dump the file list so an
        # accidental silent-suppression bug is auditable from the pipeline
        # summary without needing to re-run the build.
        _log_warning(
            f"No changed files mapped to a workspace package — skipping all test execution. "
            f"Files considered ({len(changed_files)}):"
        )
        for f in changed_files:
            print(f"  {f}")
        _emit_vso_outputs(False, "")
        return

    # Hand the merge-base SHA to pnpm's native selector. The leading `...`
    # pulls in transitive dependents so consumers of a changed package also
    # get re-tested.
    filt = f"...[{merge_base}]"
    print(f"Computed pnpm filter: {filt}")
    _emit_vso_outputs(True, filt)


if __name__ == "__main__":
    main()
    sys.exit(0)
