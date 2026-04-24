# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

"""Tests for detect_changed_packages.

Exercises the exported pure helpers so regressions in the change-detection
logic are caught before landing. Uses Python's stdlib ``unittest`` — no
third-party deps, keeping the pipeline cost of running these low.

Pipeline invocation (from repo root):

    python3 -m unittest discover -s scripts/test -p 'test_*.py'
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Make scripts/ importable so we can pull in the module under test.
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SCRIPTS_DIR))

from detect_changed_packages import (  # noqa: E402
    any_changed_file_in_packages,
    build_package_dir_set,
    check_full_run_patterns,
    normalize_target_branch,
)


class NormalizeTargetBranchTests(unittest.TestCase):
    def test_strips_refs_heads_prefix(self) -> None:
        self.assertEqual(normalize_target_branch("refs/heads/main"), "main")

    def test_passes_plain_branch_names_through(self) -> None:
        self.assertEqual(normalize_target_branch("next"), "next")

    def test_preserves_slashes_after_the_prefix(self) -> None:
        self.assertEqual(
            normalize_target_branch("refs/heads/release/2.x"), "release/2.x"
        )

    def test_returns_empty_string_for_empty_input(self) -> None:
        self.assertEqual(normalize_target_branch(""), "")


class CheckFullRunPatternsTests(unittest.TestCase):
    def test_matches_pnpm_lock_yaml(self) -> None:
        match = check_full_run_patterns(["pnpm-lock.yaml"])
        assert match is not None
        self.assertEqual(match.pattern, r"^pnpm-lock\.yaml$")

    def test_matches_pnpmfile_cjs(self) -> None:
        match = check_full_run_patterns([".pnpmfile.cjs"])
        assert match is not None
        self.assertEqual(match.pattern, r"^\.pnpmfile\.cjs$")

    def test_matches_npmrc(self) -> None:
        match = check_full_run_patterns([".npmrc"])
        assert match is not None
        self.assertEqual(match.pattern, r"^\.npmrc$")

    def test_matches_nvmrc(self) -> None:
        match = check_full_run_patterns([".nvmrc"])
        assert match is not None
        self.assertEqual(match.pattern, r"^\.nvmrc$")

    def test_matches_tools_prefix(self) -> None:
        match = check_full_run_patterns(["tools/pipelines/build-client.yml"])
        self.assertIsNotNone(match, "expected tools/ prefix to match")

    def test_matches_root_package_json_not_nested(self) -> None:
        self.assertIsNone(check_full_run_patterns(["packages/foo/package.json"]))
        match = check_full_run_patterns(["package.json"])
        assert match is not None
        self.assertEqual(match.pattern, r"^package\.json$")

    def test_matches_root_tsconfig_anchored_not_nested(self) -> None:
        self.assertIsNotNone(check_full_run_patterns(["tsconfig.base.json"]))
        self.assertIsNone(check_full_run_patterns(["packages/foo/tsconfig.json"]))

    def test_returns_none_when_nothing_matches(self) -> None:
        self.assertIsNone(check_full_run_patterns(["packages/foo/src/x.ts"]))

    def test_returns_first_pattern_hit_when_several_qualify(self) -> None:
        # Stability matters for readable pipeline logs.
        match = check_full_run_patterns(["pnpm-lock.yaml", "biome.jsonc"])
        assert match is not None
        self.assertEqual(match.pattern, r"^pnpm-lock\.yaml$")


class BuildPackageDirSetTests(unittest.TestCase):
    def test_unions_historical_and_current_packages(self) -> None:
        historical = ["packages/old/package.json", "packages/shared/package.json"]
        current = ["packages/shared/package.json", "packages/new/package.json"]
        dirs = build_package_dir_set("sha", lambda _: historical, lambda: current)
        self.assertEqual(
            sorted(dirs), ["packages/new", "packages/old", "packages/shared"]
        )

    def test_maps_a_root_level_package_json_to_dot(self) -> None:
        dirs = build_package_dir_set("sha", lambda _: ["package.json"], lambda: [])
        self.assertEqual(list(dirs), ["."])

    def test_tolerates_either_list_being_empty(self) -> None:
        self.assertEqual(
            len(build_package_dir_set("sha", lambda _: [], lambda: [])), 0
        )
        self.assertEqual(
            len(
                build_package_dir_set(
                    "sha", lambda _: ["packages/a/package.json"], lambda: []
                )
            ),
            1,
        )


class AnyChangedFileInPackagesTests(unittest.TestCase):
    PKG_DIRS = {"packages/alive"}

    def test_detects_file_inside_known_package_dir(self) -> None:
        self.assertTrue(
            any_changed_file_in_packages(["packages/alive/src/x.ts"], self.PKG_DIRS)
        )

    def test_returns_false_for_root_only_changes(self) -> None:
        # Root-level file changes are handled by FULL_RUN_PATTERNS, not here.
        self.assertFalse(any_changed_file_in_packages(["README.md"], self.PKG_DIRS))

    def test_returns_false_when_file_lives_in_unrelated_sibling_dir(self) -> None:
        self.assertFalse(
            any_changed_file_in_packages(["packages/other/src.ts"], self.PKG_DIRS)
        )

    def test_ignores_empty_file_entries(self) -> None:
        self.assertTrue(
            any_changed_file_in_packages(["", "packages/alive/src.ts"], self.PKG_DIRS)
        )

    def test_walks_up_from_nested_paths_to_find_ancestor(self) -> None:
        self.assertTrue(
            any_changed_file_in_packages(
                ["packages/alive/src/deeply/nested/x.ts"], self.PKG_DIRS
            )
        )

    def test_does_not_treat_root_pseudo_dir_as_per_package_hit(self) -> None:
        # Even if '.' is in package_dirs (root package.json case), we should
        # not declare per-package changes for a random root file.
        dirs_with_root = {".", "packages/alive"}
        self.assertFalse(
            any_changed_file_in_packages(["some-root-file.md"], dirs_with_root)
        )


if __name__ == "__main__":
    unittest.main()
