/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Tests for detect-changed-packages.ts. These exercise the exported pure
 * helpers so regressions in the change-detection logic are caught before
 * landing. Uses Node's built-in test runner (node:test) — no mocha/jest
 * needed, keeping the pipeline cost of running these low.
 *
 * Pipeline invocation (from repo root, after `pnpm install`):
 *   pnpm run test:scripts
 */

import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";

import {
	FULL_RUN_PATTERNS,
	buildPackageDirSet,
	checkFullRunPatterns,
	findChangedPackages,
	normalizeTargetBranch,
} from "../detect-changed-packages.ts";

describe("normalizeTargetBranch", () => {
	it("strips refs/heads/ prefix", () => {
		strictEqual(normalizeTargetBranch("refs/heads/main"), "main");
	});

	it("passes plain branch names through", () => {
		strictEqual(normalizeTargetBranch("next"), "next");
	});

	it("preserves slashes after the prefix", () => {
		strictEqual(normalizeTargetBranch("refs/heads/release/2.x"), "release/2.x");
	});

	it("returns empty string for empty input", () => {
		strictEqual(normalizeTargetBranch(""), "");
	});
});

describe("checkFullRunPatterns", () => {
	it("matches pnpm-lock.yaml", () => {
		const match = checkFullRunPatterns(["pnpm-lock.yaml"]);
		strictEqual(match?.source, "^pnpm-lock\\.yaml$");
	});

	it("matches .pnpmfile.cjs (added in review)", () => {
		const match = checkFullRunPatterns([".pnpmfile.cjs"]);
		strictEqual(match?.source, "^\\.pnpmfile\\.cjs$");
	});

	it("matches .npmrc (added in review)", () => {
		const match = checkFullRunPatterns([".npmrc"]);
		strictEqual(match?.source, "^\\.npmrc$");
	});

	it("matches .nvmrc (added in review)", () => {
		const match = checkFullRunPatterns([".nvmrc"]);
		strictEqual(match?.source, "^\\.nvmrc$");
	});

	it("matches tools/ prefix", () => {
		const match = checkFullRunPatterns(["tools/pipelines/build-client.yml"]);
		ok(match, "expected tools/ prefix to match");
	});

	it("matches ROOT package.json, not a nested one", () => {
		strictEqual(checkFullRunPatterns(["packages/foo/package.json"]), undefined);
		strictEqual(checkFullRunPatterns(["package.json"])?.source, "^package\\.json$");
	});

	it("matches root tsconfig (anchored), not nested", () => {
		ok(checkFullRunPatterns(["tsconfig.base.json"]));
		strictEqual(checkFullRunPatterns(["packages/foo/tsconfig.json"]), undefined);
	});

	it("returns undefined when nothing matches", () => {
		strictEqual(checkFullRunPatterns(["packages/foo/src/x.ts"]), undefined);
	});

	it("returns the first pattern hit when several qualify", () => {
		// Stability matters for readable pipeline logs.
		const match = checkFullRunPatterns(["pnpm-lock.yaml", "biome.jsonc"]);
		strictEqual(match?.source, "^pnpm-lock\\.yaml$");
	});

	it("exposes the pattern list for external audits", () => {
		ok(FULL_RUN_PATTERNS.length > 0);
		// Ensure each of the three review-added patterns made it into the
		// exported list (not just the checker).
		const sources = FULL_RUN_PATTERNS.map((r) => r.source);
		ok(sources.includes("^\\.pnpmfile\\.cjs$"));
		ok(sources.includes("^\\.npmrc$"));
		ok(sources.includes("^\\.nvmrc$"));
	});
});

describe("buildPackageDirSet", () => {
	it("unions historical and current packages", () => {
		const historical = ["packages/old/package.json", "packages/shared/package.json"];
		const current = ["packages/shared/package.json", "packages/new/package.json"];
		const dirs = buildPackageDirSet("sha", () => historical, () => current);
		deepStrictEqual(
			[...dirs].sort(),
			["packages/new", "packages/old", "packages/shared"],
		);
	});

	it("maps a root-level package.json to '.'", () => {
		const dirs = buildPackageDirSet("sha", () => ["package.json"], () => []);
		deepStrictEqual([...dirs], ["."]);
	});

	it("tolerates either list being empty", () => {
		strictEqual(buildPackageDirSet("sha", () => [], () => []).size, 0);
		strictEqual(
			buildPackageDirSet("sha", () => ["packages/a/package.json"], () => []).size,
			1,
		);
	});
});

describe("findChangedPackages", () => {
	const pkgDirs = new Set(["packages/alive", "packages/doomed"]);

	it("detects a file inside a known package dir", () => {
		strictEqual(findChangedPackages(["packages/alive/src/x.ts"], pkgDirs), true);
	});

	it("detects a deleted package's file (regression — see review #3133324370)", () => {
		// Working-tree check would MISS this because packages/doomed/package.json
		// no longer exists on disk. The historical-set merge in
		// buildPackageDirSet is what keeps this path live.
		strictEqual(findChangedPackages(["packages/doomed/package.json"], pkgDirs), true);
	});

	it("detects a NEW package (added on this branch)", () => {
		const withNew = new Set(["packages/new"]);
		strictEqual(
			findChangedPackages(["packages/new/package.json", "packages/new/src.ts"], withNew),
			true,
		);
	});

	it("returns false for root-only changes", () => {
		// Root-level file changes are handled by FULL_RUN_PATTERNS, not here.
		strictEqual(findChangedPackages(["README.md"], pkgDirs), false);
	});

	it("returns false when file lives in an unrelated sibling dir", () => {
		strictEqual(findChangedPackages(["packages/other/src.ts"], pkgDirs), false);
	});

	it("ignores empty file entries", () => {
		strictEqual(findChangedPackages(["", "packages/alive/src.ts"], pkgDirs), true);
	});

	it("walks up from nested paths to find an ancestor package dir", () => {
		strictEqual(
			findChangedPackages(["packages/alive/src/deeply/nested/x.ts"], pkgDirs),
			true,
		);
	});

	it("does not treat the root pseudo-dir '.' as a per-package hit", () => {
		// Even if '.' is in packageDirs (root package.json case), we should
		// not declare per-package changes for a random root file.
		const dirsWithRoot = new Set([".", "packages/alive"]);
		strictEqual(findChangedPackages(["some-root-file.md"], dirsWithRoot), false);
	});
});
