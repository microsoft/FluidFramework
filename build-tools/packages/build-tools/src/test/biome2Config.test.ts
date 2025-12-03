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
	type Biome2ConfigResolved,
	getBiome2FormattedFilesFromDirectory,
	getSettingValuesFromBiome2Config,
	loadBiome2Config,
	parseIncludes,
} from "../common/biome2Config";
import { GitRepo } from "../common/gitRepo";
import { getResolvedFluidRoot } from "../fluidBuild/fluidUtils";
import { testDataPath } from "./init";

describe("Biome 2.x config loading", () => {
	describe("parseIncludes", () => {
		it("returns empty arrays for undefined input", () => {
			const result = parseIncludes(undefined);
			assert.deepEqual(result, { includePatterns: [], ignorePatterns: [] });
		});

		it("returns empty arrays for null input", () => {
			const result = parseIncludes(null);
			assert.deepEqual(result, { includePatterns: [], ignorePatterns: [] });
		});

		it("separates include and negation patterns", () => {
			const includes = ["**", "src/**", "!node_modules/**", "!dist/**"];
			const result = parseIncludes(includes);
			assert.deepEqual(result.includePatterns, ["**", "src/**"]);
			assert.deepEqual(result.ignorePatterns, ["node_modules/**", "dist/**"]);
		});

		it("handles all include patterns", () => {
			const includes = ["src/**", "lib/**"];
			const result = parseIncludes(includes);
			assert.deepEqual(result.includePatterns, ["src/**", "lib/**"]);
			assert.deepEqual(result.ignorePatterns, []);
		});

		it("handles all negation patterns", () => {
			const includes = ["!node_modules/**", "!dist/**"];
			const result = parseIncludes(includes);
			assert.deepEqual(result.includePatterns, []);
			assert.deepEqual(result.ignorePatterns, ["node_modules/**", "dist/**"]);
		});
	});

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

	describe("getSettingValuesFromBiome2Config", () => {
		const testFile = path.resolve(testDataPath, "biome2/pkg-a/config.jsonc");
		let testConfig: Biome2ConfigResolved;

		before(async () => {
			testConfig = await loadBiome2Config(testFile);
		});

		it("parses formatter includes with negation patterns", async () => {
			const { includePatterns, ignorePatterns } = getSettingValuesFromBiome2Config(
				testConfig,
				"formatter",
			);
			// Should have include patterns from files and formatter sections
			assert(includePatterns.has("pkg-a-include/**"));
			assert(includePatterns.has("include-formatter/**"));
			// Should have ignore patterns from negated entries
			assert(ignorePatterns.has("pkg-a-ignore/**"));
			assert(ignorePatterns.has("ignore-formatter/**"));
		});

		it("parses linter includes with negation patterns", async () => {
			const { includePatterns, ignorePatterns } = getSettingValuesFromBiome2Config(
				testConfig,
				"linter",
			);
			// Should have include patterns from files and linter sections
			assert(includePatterns.has("pkg-a-include/**"));
			assert(includePatterns.has("include-linter/**"));
			// Should have ignore patterns from negated entries
			assert(ignorePatterns.has("pkg-a-ignore/**"));
			assert(ignorePatterns.has("ignore-linter/**"));
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
});
