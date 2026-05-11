/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
	anyChangedFileInPackages,
	buildPackageDirSet,
	checkFullRunPatterns,
	normalizeTargetBranch,
} from "../detect_changed_packages.mjs";

test("normalizeTargetBranch strips refs/heads prefix", () => {
	assert.equal(normalizeTargetBranch("refs/heads/main"), "main");
});

test("normalizeTargetBranch passes plain branch names through", () => {
	assert.equal(normalizeTargetBranch("next"), "next");
});

test("normalizeTargetBranch preserves slashes after the prefix", () => {
	assert.equal(normalizeTargetBranch("refs/heads/release/2.x"), "release/2.x");
});

test("normalizeTargetBranch returns empty string for empty input", () => {
	assert.equal(normalizeTargetBranch(""), "");
});

test("checkFullRunPatterns matches pnpm-lock.yaml", () => {
	const match = checkFullRunPatterns(["pnpm-lock.yaml"]);
	assert.ok(match);
	assert.equal(match.source, "^pnpm-lock\\.yaml$");
});

test("checkFullRunPatterns matches .pnpmfile.cjs", () => {
	const match = checkFullRunPatterns([".pnpmfile.cjs"]);
	assert.ok(match);
	assert.equal(match.source, "^\\.pnpmfile\\.cjs$");
});

test("checkFullRunPatterns matches .npmrc", () => {
	const match = checkFullRunPatterns([".npmrc"]);
	assert.ok(match);
	assert.equal(match.source, "^\\.npmrc$");
});

test("checkFullRunPatterns matches .nvmrc", () => {
	const match = checkFullRunPatterns([".nvmrc"]);
	assert.ok(match);
	assert.equal(match.source, "^\\.nvmrc$");
});

test("checkFullRunPatterns matches tools prefix", () => {
	const match = checkFullRunPatterns(["tools/pipelines/build-client.yml"]);
	assert.ok(match, "expected tools/ prefix to match");
});

test("checkFullRunPatterns matches root package.json but not nested package.json", () => {
	assert.equal(checkFullRunPatterns(["packages/foo/package.json"]), undefined);
	const match = checkFullRunPatterns(["package.json"]);
	assert.ok(match);
	assert.equal(match.source, "^package\\.json$");
});

test("checkFullRunPatterns matches root tsconfig only", () => {
	assert.ok(checkFullRunPatterns(["tsconfig.base.json"]));
	assert.equal(checkFullRunPatterns(["packages/foo/tsconfig.json"]), undefined);
});

test("checkFullRunPatterns returns undefined when nothing matches", () => {
	assert.equal(checkFullRunPatterns(["packages/foo/src/x.ts"]), undefined);
});

test("checkFullRunPatterns returns the first pattern hit when several qualify", () => {
	const match = checkFullRunPatterns(["pnpm-lock.yaml", "biome.jsonc"]);
	assert.ok(match);
	assert.equal(match.source, "^pnpm-lock\\.yaml$");
});

test("buildPackageDirSet unions historical and current packages", () => {
	const historical = ["packages/old/package.json", "packages/shared/package.json"];
	const current = ["packages/shared/package.json", "packages/new/package.json"];
	const dirs = buildPackageDirSet(
		"sha",
		() => historical,
		() => current,
	);
	assert.deepEqual([...dirs].sort(), ["packages/new", "packages/old", "packages/shared"]);
});

test("buildPackageDirSet maps a root-level package.json to dot", () => {
	const dirs = buildPackageDirSet(
		"sha",
		() => ["package.json"],
		() => [],
	);
	assert.deepEqual([...dirs], ["."]);
});

test("buildPackageDirSet tolerates either package list being empty", () => {
	assert.equal(
		buildPackageDirSet(
			"sha",
			() => [],
			() => [],
		).size,
		0,
	);
	assert.equal(
		buildPackageDirSet(
			"sha",
			() => ["packages/a/package.json"],
			() => [],
		).size,
		1,
	);
});

const packageDirs = new Set(["packages/alive"]);

test("anyChangedFileInPackages detects file inside known package dir", () => {
	assert.equal(anyChangedFileInPackages(["packages/alive/src/x.ts"], packageDirs), true);
});

test("anyChangedFileInPackages returns false for root-only changes", () => {
	assert.equal(anyChangedFileInPackages(["README.md"], packageDirs), false);
});

test("anyChangedFileInPackages returns false for unrelated sibling directory", () => {
	assert.equal(anyChangedFileInPackages(["packages/other/src.ts"], packageDirs), false);
});

test("anyChangedFileInPackages ignores empty file entries", () => {
	assert.equal(anyChangedFileInPackages(["", "packages/alive/src.ts"], packageDirs), true);
});

test("anyChangedFileInPackages walks up from nested paths to find ancestor", () => {
	assert.equal(
		anyChangedFileInPackages(["packages/alive/src/deeply/nested/x.ts"], packageDirs),
		true,
	);
});

test("anyChangedFileInPackages does not treat root pseudo-dir as a per-package hit", () => {
	const dirsWithRoot = new Set([".", "packages/alive"]);
	assert.equal(anyChangedFileInPackages(["some-root-file.md"], dirsWithRoot), false);
});
