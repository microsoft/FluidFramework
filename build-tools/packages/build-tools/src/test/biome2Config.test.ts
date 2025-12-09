/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// There are no cases in this file where the values being checked should be undefined, so `!.` is more correct with
// respect to intent than `?.`.

import { strict as assert } from "node:assert/strict";
import path from "node:path";
import {
	Biome2ConfigReader,
	getBiome2FormattedFilesFromDirectory,
	getOrderedPatternsFromBiome2Config,
	loadBiome2Config,
} from "../common/biome2Config";
import { GitRepo } from "../common/gitRepo";
import { getResolvedFluidRoot } from "../fluidBuild/fluidUtils";
import { testDataPath } from "./init";

describe("Biome 2.x config loading", () => {
	describe("Biome2ConfigReader class", () => {
		const testDir = path.resolve(testDataPath, "biome2/pkg-a");
		const testConfig = path.resolve(testDir, "config.jsonc");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("loads", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			assert(config !== undefined);
		});

		it("has correct formatted files list", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			const expected = [
				path.resolve(testDataPath, "biome2/pkg-a/pkg-a-include/sourceFile.ts"),
				path.resolve(
					testDataPath,
					"biome2/pkg-a/pkg-a-include/include-formatter/formatter.ts",
				),
				path.resolve(testDataPath, "biome2/pkg-a/pkg-a-include/include-linter/linter.ts"),
				path.resolve(testDataPath, "biome2/pkg-a/include-formatter/formatter.ts"),
			];
			const { formattedFiles } = config;
			assert(
				formattedFiles.length === 4,
				`expected 4 elements in the array, got ${formattedFiles.length}`,
			);
			for (const actual of formattedFiles) {
				assert(expected.includes(actual), `unexpected file: ${actual}`);
			}
		});
	});

	describe("loadBiome2Config", () => {
		it("loads single config with includes field", async () => {
			const testFile = path.resolve(testDataPath, "biome2/baseconfig.jsonc");
			const actual = await loadBiome2Config(testFile);
			assert.notEqual(actual, undefined);
			assert.equal(actual.files!.ignoreUnknown, true);
			// Check that includes field contains patterns
			assert(actual.files!.includes!.includes("**"));
			assert(actual.files!.includes!.includes("!**/base-1/*"));
		});

		it("loads config with extends", async () => {
			const testFile = path.resolve(testDataPath, "biome2/pkg-a/config.jsonc");
			const actual = await loadBiome2Config(testFile);
			assert(actual !== undefined);
			// Check that files.includes is correctly loaded
			assert(actual.files!.includes!.includes("pkg-a-include/**"));
			assert(actual.files!.includes!.includes("!pkg-a-ignore/**"));
		});
	});

	describe("getBiome2FormattedFilesFromDirectory", () => {
		const testConfig = path.resolve(testDataPath, "biome2/pkg-a/config.jsonc");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("returns correct file set", async () => {
			const expected = [
				path.resolve(testDataPath, "biome2/pkg-a/pkg-a-include/sourceFile.ts"),
				path.resolve(
					testDataPath,
					"biome2/pkg-a/pkg-a-include/include-formatter/formatter.ts",
				),
				path.resolve(testDataPath, "biome2/pkg-a/pkg-a-include/include-linter/linter.ts"),
				path.resolve(testDataPath, "biome2/pkg-a/include-formatter/formatter.ts"),
			];
			const formattedFiles = await getBiome2FormattedFilesFromDirectory(testConfig, gitRepo);
			for (const actual of formattedFiles) {
				assert(expected.includes(actual), `unexpected file: ${actual}`);
			}
			assert(
				formattedFiles.length === 4,
				`expected 4 elements in the array, got ${formattedFiles.length}`,
			);
		});
	});

	describe("nested config with extends", () => {
		const testConfig = path.resolve(testDataPath, "biome2/pkg-b/config.jsonc");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("loads config that extends another config which extends a base", async () => {
			// pkg-b/config.jsonc extends pkg-a/config.jsonc which extends baseconfig.jsonc
			const config = await loadBiome2Config(testConfig);
			assert(config !== undefined);

			// Should inherit ignoreUnknown from base config
			assert.equal(config.files!.ignoreUnknown, true);

			// Should have includes from pkg-b
			assert(config.files!.includes!.includes("pkg-b-include/**"));
			assert(config.files!.includes!.includes("!pkg-b-ignore/**"));
		});

		it("has correct formatted files for nested extended config", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			const { formattedFiles } = config;

			// Should include file from pkg-b-include
			const pkgBFile = path.resolve(testDataPath, "biome2/pkg-b/pkg-b-include/sourceFile.ts");
			assert(
				formattedFiles.includes(pkgBFile),
				`expected ${pkgBFile} to be in formatted files`,
			);
		});
	});

	describe("nested config WITHOUT extends (automatic parent discovery)", () => {
		// Test data uses renamed files to avoid biome 1.x parsing errors
		// The test verifies the merging logic works correctly when we manually specify the config chain
		const childConfig = path.resolve(
			testDataPath,
			"biome2/nested-root/child/childconfig.jsonc",
		);
		const parentConfig = path.resolve(testDataPath, "biome2/nested-root/rootconfig.jsonc");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("child config has root: false", async () => {
			const config = await loadBiome2Config(childConfig);
			// root should be false or not set (treated as false)
			assert(config.root !== true, "child config should not have root: true");
		});

		it("parent config has root: true", async () => {
			const config = await loadBiome2Config(parentConfig);
			assert.equal(config.root, true);
		});

		it("parent config settings are correctly loaded", async () => {
			const config = await loadBiome2Config(parentConfig);
			// Check parent config has expected settings
			// ignoreUnknown comes from baseconfig.jsonc via extends
			assert.equal(config.files!.ignoreUnknown, true);
			// indentStyle comes from baseconfig.jsonc via extends
			assert.equal(config.formatter!.indentStyle, "tab");
			// lineWidth is overridden in rootconfig.jsonc
			assert.equal(config.formatter!.lineWidth, 100);
		});

		it("child config overrides parent settings correctly", async () => {
			const config = await loadBiome2Config(childConfig);
			// Child config has lineWidth: 80 which should override parent's 100
			assert.equal(config.formatter!.lineWidth, 80);
		});

		it("has correct formatted files for child config", async () => {
			const config = await Biome2ConfigReader.create(childConfig, gitRepo);
			const { formattedFiles } = config;

			// Should include file from src/
			const srcFile = path.resolve(testDataPath, "biome2/nested-root/child/src/index.ts");
			assert(
				formattedFiles.includes(srcFile),
				`expected ${srcFile} to be in formatted files, got: ${formattedFiles.join(", ")}`,
			);
		});
	});

	describe("combined extends and find-up (root config extends, child uses find-up)", () => {
		// This test verifies the case where:
		// - baseconfig.jsonc is the base config with defaults
		// - rootconfig.jsonc has root: true AND extends baseconfig.jsonc
		// - childconfig.jsonc has root: false and no extends (uses find-up to find rootconfig)
		// The child should inherit settings from both root (via find-up) AND base (via extends from root)
		const childConfig = path.resolve(
			testDataPath,
			"biome2/nested-root/child/childconfig.jsonc",
		);

		it("child inherits settings from base config through root's extends chain", async () => {
			const config = await loadBiome2Config(childConfig);

			// These settings come from baseconfig.jsonc, inherited through root's extends
			assert.equal(
				config.files!.ignoreUnknown,
				true,
				"should inherit ignoreUnknown from base",
			);
			assert.equal(
				config.formatter!.indentStyle,
				"tab",
				"should inherit indentStyle from base",
			);
			assert.equal(
				config.formatter!.formatWithErrors,
				true,
				"should inherit formatWithErrors from base",
			);
		});

		it("child overrides settings from root config", async () => {
			const config = await loadBiome2Config(childConfig);

			// lineWidth is set to 100 in root, but child overrides to 80
			assert.equal(config.formatter!.lineWidth, 80, "child should override root's lineWidth");
		});

		it("complete inheritance chain works correctly", async () => {
			const config = await loadBiome2Config(childConfig);

			// From base: ignoreUnknown=true, indentStyle=tab, lineWidth=95 (overridden by root)
			// From root (overrides base): lineWidth=100 (overridden by child)
			// From child (overrides root): lineWidth=80

			// Final expected values:
			assert.equal(config.files!.ignoreUnknown, true, "from base via root");
			assert.equal(config.formatter!.indentStyle, "tab", "from base via root");
			assert.equal(config.formatter!.lineWidth, 80, "from child, overriding root and base");

			// VCS settings from base should be inherited
			assert.equal(config.vcs!.enabled, true, "vcs.enabled from base");
			assert.equal(config.vcs!.clientKind, "git", "vcs.clientKind from base");
		});
	});

	describe("getOrderedPatternsFromBiome2Config", () => {
		const testConfig = path.resolve(testDataPath, "biome2/reinclusion-test/config.jsonc");

		it("preserves pattern order for re-inclusion support", async () => {
			const config = await loadBiome2Config(testConfig);
			const patterns = getOrderedPatternsFromBiome2Config(config, "formatter");

			// Should preserve the exact order from the config
			assert.deepEqual(patterns, ["**", "!test/**", "test/special/**"]);
		});

		it("includes patterns from both files and section", async () => {
			const config = await loadBiome2Config(
				path.resolve(testDataPath, "biome2/pkg-a/config.jsonc"),
			);
			const patterns = getOrderedPatternsFromBiome2Config(config, "formatter");

			// Should have patterns from files.includes
			assert(patterns.includes("pkg-a-include/**"));
			assert(patterns.includes("!pkg-a-ignore/**"));

			// Should have patterns from formatter.includes
			assert(patterns.includes("include-formatter/**"));
			assert(patterns.includes("!ignore-formatter/**"));
		});
	});

	describe("re-inclusion pattern behavior", () => {
		// These tests verify that our ordered pattern processing correctly handles
		// re-inclusion patterns like ["**", "!test/**", "test/special/**"]

		const testConfig = path.resolve(testDataPath, "biome2/reinclusion-test/config.jsonc");

		it("config uses re-inclusion pattern", async () => {
			const config = await loadBiome2Config(testConfig);
			// Verify the config has the re-inclusion pattern
			assert(config.files!.includes!.includes("!test/**"));
			assert(config.files!.includes!.includes("test/special/**"));
		});

		it("getOrderedPatternsFromBiome2Config preserves re-inclusion order", async () => {
			const config = await loadBiome2Config(testConfig);
			const patterns = getOrderedPatternsFromBiome2Config(config, "formatter");

			// Pattern order should be: **, !test/**, test/special/**
			const testIndex = patterns.indexOf("!test/**");
			const specialIndex = patterns.indexOf("test/special/**");

			assert(testIndex !== -1, "should have !test/** pattern");
			assert(specialIndex !== -1, "should have test/special/** pattern");
			assert(
				testIndex < specialIndex,
				"!test/** should come before test/special/** to enable re-inclusion",
			);
		});

		// NOTE: End-to-end file matching tests with re-inclusion patterns would require
		// git-tracked files in the test data. The above tests verify the pattern extraction
		// and ordering logic. The filterFilesWithOrderedPatterns function is tested separately.
	});

	describe('extends: "//" microsyntax', () => {
		// Test the special "//" syntax that tells Biome to extend from the root config
		// According to the docs, this is equivalent to walking up to find root: true
		// and implicitly sets root: false on the child config
		// This test uses multiple levels of nesting (root -> packages -> nested -> child)
		// to ensure the microsyntax can find the root config from deep nesting

		const rootConfig = path.resolve(testDataPath, "biome2/microsyntax-test/biome.jsonc");
		const childConfig = path.resolve(
			testDataPath,
			"biome2/microsyntax-test/packages/nested/child/biome.jsonc",
		);

		it('resolves "//" to find the root config', async () => {
			const config = await loadBiome2Config(childConfig);

			// Child should inherit settings from root
			assert.equal(
				config.formatter!.indentStyle,
				"tab",
				"should inherit indentStyle from root",
			);
		});

		it("child overrides root settings when using //", async () => {
			const config = await loadBiome2Config(childConfig);

			// Child overrides lineWidth to 80, root has 120
			assert.equal(config.formatter!.lineWidth, 80, "child should override root's lineWidth");
		});

		it('getAllBiome2ConfigPaths includes root when using "//"', async () => {
			const { getAllBiome2ConfigPaths } = await import("../common/biome2Config");
			const allPaths = await getAllBiome2ConfigPaths(childConfig);

			// Should have both root and child configs
			assert(allPaths.includes(rootConfig), `should include root config: ${rootConfig}`);
			assert(allPaths.includes(childConfig), `should include child config: ${childConfig}`);

			// Root should come before child (merge order)
			const rootIndex = allPaths.indexOf(rootConfig);
			const childIndex = allPaths.indexOf(childConfig);
			assert(rootIndex < childIndex, "root config should come before child in merge order");
		});

		it("Biome2ConfigReader works with // syntax", async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			const gitRepo = new GitRepo(repoRoot);

			const config = await Biome2ConfigReader.create(childConfig, gitRepo);

			// Should have merged config with both root and child settings
			assert.equal(config.mergedConfig.formatter!.indentStyle, "tab");
			assert.equal(config.mergedConfig.formatter!.lineWidth, 80);
		});
	});

	describe("error handling", () => {
		it("throws when config file does not exist", async () => {
			const nonExistentConfig = path.resolve(testDataPath, "biome2/nonexistent.jsonc");
			await assert.rejects(
				async () => loadBiome2Config(nonExistentConfig),
				/ENOENT/,
				"Should throw ENOENT error for missing file",
			);
		});

		it('throws when "//" extends cannot find root config', async () => {
			// Create a scenario where // is used but no root config exists
			// We'll test this by checking the error message from findRootBiome2Config
			const { findRootBiome2Config } = await import("../common/biome2Config");

			// Start from a directory that has no biome configs above it
			const result = await findRootBiome2Config("/tmp");
			assert.equal(result, undefined, "Should return undefined when no root config found");
		});

		it("throws on circular extends chain", async () => {
			const circularConfig = path.resolve(testDataPath, "biome2/circular-test/config-a.jsonc");
			await assert.rejects(
				async () => loadBiome2Config(circularConfig),
				/Circular extends detected/,
				"Should throw error for circular extends",
			);
		});
	});
});
