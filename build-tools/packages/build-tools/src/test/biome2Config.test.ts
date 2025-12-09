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
			assert.deepEqual(patterns, ["**", "!excluded-dir/**", "excluded-dir/reincluded/**"]);
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
			assert(config.files!.includes!.includes("!excluded-dir/**"));
			assert(config.files!.includes!.includes("excluded-dir/reincluded/**"));
		});

		it("getOrderedPatternsFromBiome2Config preserves re-inclusion order", async () => {
			const config = await loadBiome2Config(testConfig);
			const patterns = getOrderedPatternsFromBiome2Config(config, "formatter");

			// Pattern order should be: **, !excluded-dir/**, excluded-dir/reincluded/**
			const excludedIndex = patterns.indexOf("!excluded-dir/**");
			const reincludedIndex = patterns.indexOf("excluded-dir/reincluded/**");

			assert(excludedIndex !== -1, "should have !excluded-dir/** pattern");
			assert(reincludedIndex !== -1, "should have excluded-dir/reincluded/** pattern");
			assert(
				excludedIndex < reincludedIndex,
				"!excluded-dir/** should come before excluded-dir/reincluded/** to enable re-inclusion",
			);
		});

		// NOTE: End-to-end file matching tests with re-inclusion patterns are in the
		// "re-inclusion pattern file filtering (end-to-end)" describe block below.
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

	describe("re-inclusion pattern file filtering (end-to-end)", () => {
		// These tests verify that re-inclusion patterns like ["**", "!excluded-dir/**", "excluded-dir/reincluded/**"]
		// correctly include, exclude, and re-include files during actual file filtering.
		// Note: We use "excluded-dir" instead of "test" to avoid matching the "test" in the path
		// "src/test/data/..." which would cause false exclusions due to the **/ prefix applied to patterns.
		const testConfig = path.resolve(testDataPath, "biome2/reinclusion-test/config.jsonc");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("includes files matching initial include pattern", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			const { formattedFiles } = config;

			// src/included.ts should be included by the "**" pattern
			const srcFile = path.resolve(testDataPath, "biome2/reinclusion-test/src/included.ts");
			assert(formattedFiles.includes(srcFile), `expected ${srcFile} to be in formatted files`);
		});

		it("excludes files matching exclusion pattern", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			const { formattedFiles } = config;

			// excluded-dir/excluded.ts should be excluded by the "!excluded-dir/**" pattern
			const excludedFile = path.resolve(
				testDataPath,
				"biome2/reinclusion-test/excluded-dir/excluded.ts",
			);
			assert(
				!formattedFiles.includes(excludedFile),
				`expected ${excludedFile} to NOT be in formatted files`,
			);
		});

		it("re-includes files matching re-inclusion pattern after exclusion", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			const { formattedFiles } = config;

			// excluded-dir/reincluded/reincluded.ts should be re-included by the "excluded-dir/reincluded/**" pattern
			const reincludedFile = path.resolve(
				testDataPath,
				"biome2/reinclusion-test/excluded-dir/reincluded/reincluded.ts",
			);
			assert(
				formattedFiles.includes(reincludedFile),
				`expected ${reincludedFile} to be in formatted files (re-included after exclusion)`,
			);
		});

		it("returns correct complete file set with re-inclusion", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);
			const { formattedFiles } = config;

			const srcFile = path.resolve(testDataPath, "biome2/reinclusion-test/src/included.ts");
			const excludedFile = path.resolve(
				testDataPath,
				"biome2/reinclusion-test/excluded-dir/excluded.ts",
			);
			const reincludedFile = path.resolve(
				testDataPath,
				"biome2/reinclusion-test/excluded-dir/reincluded/reincluded.ts",
			);

			// Should include src/included.ts and excluded-dir/reincluded/reincluded.ts
			// Should NOT include excluded-dir/excluded.ts
			assert(formattedFiles.includes(srcFile), "should include src/included.ts");
			assert(
				!formattedFiles.includes(excludedFile),
				"should NOT include excluded-dir/excluded.ts",
			);
			assert(
				formattedFiles.includes(reincludedFile),
				"should include excluded-dir/reincluded/reincluded.ts",
			);
		});
	});

	describe("array extends syntax", () => {
		// Tests for extends: ["file1.json", "file2.json"] syntax
		const testConfig = path.resolve(testDataPath, "biome2/array-extends-test/config.jsonc");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("loads config with array extends", async () => {
			const config = await loadBiome2Config(testConfig);
			assert(config !== undefined);
		});

		it("merges settings from multiple extended configs", async () => {
			const config = await loadBiome2Config(testConfig);

			// From base-formatter.jsonc
			assert.equal(
				config.formatter!.indentStyle,
				"tab",
				"should inherit indentStyle from base-formatter.jsonc",
			);

			// From base-linter.jsonc
			assert.equal(
				config.linter!.enabled,
				true,
				"should inherit linter.enabled from base-linter.jsonc",
			);

			// Overridden in config.jsonc
			assert.equal(
				config.formatter!.lineWidth,
				80,
				"should override lineWidth from config.jsonc",
			);
		});

		it("getAllBiome2ConfigPaths returns all configs in correct order", async () => {
			const { getAllBiome2ConfigPaths } = await import("../common/biome2Config");
			const allPaths = await getAllBiome2ConfigPaths(testConfig);

			// Should have 3 configs: base-formatter, base-linter, config
			assert.equal(allPaths.length, 3, "should have 3 configs in the chain");

			// The main config should be last (applied last, highest priority)
			assert(
				allPaths[allPaths.length - 1].endsWith("config.jsonc"),
				"main config should be last",
			);

			// Both base configs should be before the main config
			const baseFormatterIndex = allPaths.findIndex((p: string) =>
				p.includes("base-formatter"),
			);
			const baseLinterIndex = allPaths.findIndex((p: string) => p.includes("base-linter"));
			const configIndex = allPaths.findIndex((p: string) => p.endsWith("config.jsonc"));

			assert(baseFormatterIndex < configIndex, "base-formatter should be before config");
			assert(baseLinterIndex < configIndex, "base-linter should be before config");
		});

		it("later extends entries override earlier ones", async () => {
			// If both base configs had the same property, the later one (base-linter.jsonc)
			// would override the earlier one (base-formatter.jsonc).
			// This test verifies the ordering is correct.
			const { getAllBiome2ConfigPaths } = await import("../common/biome2Config");
			const allPaths = await getAllBiome2ConfigPaths(testConfig);

			const baseFormatterIndex = allPaths.findIndex((p: string) =>
				p.includes("base-formatter"),
			);
			const baseLinterIndex = allPaths.findIndex((p: string) => p.includes("base-linter"));

			// base-formatter comes first, base-linter second (as declared in extends array)
			assert(
				baseFormatterIndex < baseLinterIndex,
				"base-formatter should be processed before base-linter",
			);
		});

		it("Biome2ConfigReader works with array extends", async () => {
			const config = await Biome2ConfigReader.create(testConfig, gitRepo);

			assert.equal(config.mergedConfig.formatter!.indentStyle, "tab");
			assert.equal(config.mergedConfig.formatter!.lineWidth, 80);
			assert.equal(config.mergedConfig.linter!.enabled, true);
			assert(config.formattedFiles.length > 0, "should have formatted files");
		});
	});

	describe("directory input to Biome2ConfigReader", () => {
		// Tests that Biome2ConfigReader.create works with a directory path (not just config file path)
		const testDir = path.resolve(testDataPath, "biome2/directory-input-test");
		let gitRepo: GitRepo;

		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("creates reader from directory path", async () => {
			const config = await Biome2ConfigReader.create(testDir, gitRepo);
			assert(config !== undefined);
		});

		it("finds biome.jsonc config in directory", async () => {
			const config = await Biome2ConfigReader.create(testDir, gitRepo);

			// Should find the biome.jsonc file in the directory
			assert(
				config.closestConfig.endsWith("biome.jsonc"),
				`expected closestConfig to end with biome.jsonc, got ${config.closestConfig}`,
			);
		});

		it("returns correct formatted files from directory", async () => {
			const config = await Biome2ConfigReader.create(testDir, gitRepo);
			const { formattedFiles } = config;

			const expectedFile = path.resolve(
				testDataPath,
				"biome2/directory-input-test/src/index.ts",
			);
			assert(
				formattedFiles.includes(expectedFile),
				`expected ${expectedFile} to be in formatted files`,
			);
		});

		it("sets directory property correctly", async () => {
			const config = await Biome2ConfigReader.create(testDir, gitRepo);

			assert.equal(
				config.directory,
				testDir,
				"directory property should match input directory",
			);
		});

		it("behaves same as file input for same config", async () => {
			const configFile = path.resolve(testDir, "biome.jsonc");

			const fromDir = await Biome2ConfigReader.create(testDir, gitRepo);
			const fromFile = await Biome2ConfigReader.create(configFile, gitRepo);

			// Both should produce the same formatted files
			assert.deepEqual(
				fromDir.formattedFiles.sort(),
				fromFile.formattedFiles.sort(),
				"formatted files should be the same whether created from dir or file",
			);

			// Both should have the same merged config
			assert.equal(
				fromDir.mergedConfig.formatter!.lineWidth,
				fromFile.mergedConfig.formatter!.lineWidth,
			);
		});
	});

	describe("linter section patterns", () => {
		// Tests that getOrderedPatternsFromBiome2Config works correctly with the "linter" section
		const testConfig = path.resolve(testDataPath, "biome2/linter-patterns-test/config.jsonc");

		it("extracts patterns from linter.includes", async () => {
			const config = await loadBiome2Config(testConfig);
			const patterns = getOrderedPatternsFromBiome2Config(config, "linter");

			// Should include patterns from linter.includes
			assert(
				patterns.includes("lint-only/**"),
				"should include lint-only/** from linter.includes",
			);
		});

		it("combines files.includes with linter.includes", async () => {
			const config = await loadBiome2Config(testConfig);
			const patterns = getOrderedPatternsFromBiome2Config(config, "linter");

			// Should include patterns from both files.includes and linter.includes
			assert(patterns.includes("src/**"), "should include src/** from files.includes");
			assert(
				patterns.includes("lint-only/**"),
				"should include lint-only/** from linter.includes",
			);
		});

		it("formatter and linter have different section-specific patterns", async () => {
			const config = await loadBiome2Config(testConfig);

			const formatterPatterns = getOrderedPatternsFromBiome2Config(config, "formatter");
			const linterPatterns = getOrderedPatternsFromBiome2Config(config, "linter");

			// Both should have files.includes patterns
			assert(formatterPatterns.includes("src/**"), "formatter should have src/**");
			assert(linterPatterns.includes("src/**"), "linter should have src/**");

			// Each should have their section-specific patterns
			assert(
				formatterPatterns.includes("format-only/**"),
				"formatter should have format-only/**",
			);
			assert(linterPatterns.includes("lint-only/**"), "linter should have lint-only/**");

			// Each should NOT have the other's section-specific patterns
			assert(
				!formatterPatterns.includes("lint-only/**"),
				"formatter should NOT have lint-only/**",
			);
			assert(
				!linterPatterns.includes("format-only/**"),
				"linter should NOT have format-only/**",
			);
		});

		it("files.includes patterns come before section patterns", async () => {
			const config = await loadBiome2Config(testConfig);
			const patterns = getOrderedPatternsFromBiome2Config(config, "linter");

			const filesPatternIndex = patterns.indexOf("src/**");
			const linterPatternIndex = patterns.indexOf("lint-only/**");

			assert(filesPatternIndex !== -1, "should have files.includes pattern");
			assert(linterPatternIndex !== -1, "should have linter.includes pattern");
			assert(
				filesPatternIndex < linterPatternIndex,
				"files.includes patterns should come before linter.includes patterns",
			);
		});
	});
});
