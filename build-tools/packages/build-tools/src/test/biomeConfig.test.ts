/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
// There are no cases in this file where the values being checked should be undefined, so `!.` is more correct with
// respect to intent than `?.`.

import assert from "node:assert/strict";
import path from "node:path";
import {
	BiomeConfigReader,
	type BiomeConfigResolved,
	getBiomeFormattedFilesFromDirectory,
	getSettingValuesFromBiomeConfig,
	loadBiomeConfig,
} from "../common/biomeConfig";
import type { Configuration as BiomeConfigOnDisk } from "../common/biomeConfigTypes";
import { GitRepo } from "../common/gitRepo";
import { getResolvedFluidRoot } from "../fluidBuild/fluidUtils";
import { testDataPath } from "./init";

describe("Biome config loading", () => {
	describe("BiomeConfigReader class", () => {
		// These variables need to be initialized once for all the tests in this describe block. Defining them outside
		// of the before block causes the tests to be skipped.
		const testDir = path.resolve(testDataPath, "biome/pkg-b");
		let gitRepo: GitRepo;
		before(async () => {
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
		});

		it("loads", async () => {
			const config = await BiomeConfigReader.create(testDir, gitRepo);
			assert(config !== undefined);
		});

		it("has correct formatted files list", async () => {
			const config = await BiomeConfigReader.create(testDir, gitRepo);
			const expected = [
				path.resolve(
					testDataPath,
					"biome/pkg-b/include-formatter-added-1/subdirectory/sourceFile2.ts",
				),
				path.resolve(
					testDataPath,
					"biome/pkg-b/include-formatter-added-1/subdirectory/markdownFile2.md",
				),
				path.resolve(testDataPath, "biome/pkg-b/include-formatter-added-1/sourceFile.ts"),
				path.resolve(testDataPath, "biome/pkg-b/include-formatter-added-1/markdownFile1.md"),
			];
			const { formattedFiles } = config;
			assert(
				formattedFiles.length === 4,
				`expected 4 elements in the array, got ${formattedFiles.length}`,
			);
			for (const actual of formattedFiles) {
				assert(expected.includes(actual));
			}
		});

		it("returns only files matching files.includes", async () => {
			const config = await BiomeConfigReader.create(
				path.resolve(testDataPath, "biome/pkg-b/include-md-only.jsonc"),
				gitRepo,
			);
			const expected = [
				path.resolve(
					testDataPath,
					"biome/pkg-b/include-formatter-added-1/subdirectory/markdownFile2.md",
				),
				path.resolve(testDataPath, "biome/pkg-b/include-formatter-added-1/markdownFile1.md"),
			];
			const { formattedFiles } = config;
			assert(
				formattedFiles.length === 2,
				`expected 2 elements in the array, got ${formattedFiles.length}`,
			);
			for (const actual of formattedFiles) {
				assert(expected.includes(actual));
			}
		});
	});

	describe("loadConfig", () => {
		it("throws on missing config", async () => {
			const testFile = path.resolve(testDataPath, "biome/missing.jsonc");
			assert.rejects(async () => await loadBiomeConfig(testFile), Error);
		});

		it("throws on empty config", async () => {
			const testFile = path.resolve(testDataPath, "biome/empty.jsonc");
			assert.rejects(async () => await loadBiomeConfig(testFile), Error);
		});

		it("loads single config", async () => {
			const testFile = path.resolve(testDataPath, "biome/base.jsonc");
			const actual = await loadBiomeConfig(testFile);
			assert.notEqual(actual, undefined);
			assert.equal(actual.files!.ignoreUnknown, true);
		});

		it("loads config with multiple extends", async () => {
			const testFile = path.resolve(testDataPath, "biome/pkg-b/biome.jsonc");
			const actual = await loadBiomeConfig(testFile);

			assert(actual !== undefined);

			assert(actual.files!.ignoreUnknown === false);
			assert(actual.files!.include!.includes("pkg-a-include/**"));
			assert(actual.files!.ignore!.includes("pkg-a-ignore/**"));
			assert(actual.formatter!.include!.includes("include-formatter-added-1/**"));
			assert(actual.formatter!.ignore!.includes("ignore-formatter-added-1/**"));
			assert(actual.linter!.include!.includes("include-linter-added-1/**"));
			assert(actual.linter!.ignore!.includes("ignore-linter-added-1/**"));
		});

		describe("extends from a single config", () => {
			// These variables need to be initialized once for all the tests in this describe block. Defining them outside
			// of the before block causes the tests to be skipped.
			let testConfig: BiomeConfigOnDisk;
			before(async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				testConfig = await loadBiomeConfig(testFile);
			});

			it("top-level property is inherited", async () => {
				assert(testConfig !== undefined);
				assert(testConfig.files!.ignoreUnknown === true);
			});

			it("files.include is overridden by loaded config", async () => {
				assert(testConfig.files!.include!.includes("pkg-a-include/**"));
				assert(
					testConfig.files!.include!.length === 1,
					`expected 1 elements in the array, got ${testConfig.files!.include!.length}`,
				);
			});

			it("files.ignore is overridden by loaded config", async () => {
				assert(testConfig.files!.ignore!.includes("pkg-a-ignore/**"));
				assert(
					testConfig.files!.ignore!.length === 1,
					`expected 1 elements in the array, got ${testConfig.files!.ignore!.length}`,
				);
			});

			it("formatter.include is overridden by loaded config", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.formatter!.include!.includes("include-formatter/**"));
				assert(
					actual.formatter!.include!.length === 1,
					`expected 1 elements in the array, got ${actual.formatter!.include!.length}`,
				);
			});

			it("formatter.ignore is overridden by loaded config", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.formatter!.ignore!.includes("ignore-formatter/**"));
				assert(
					actual.formatter!.ignore!.length === 1,
					`expected 1 elements in the array, got ${actual.formatter!.ignore!.length}`,
				);
			});

			it("linter.include is overridden by loaded config", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.linter!.include!.includes("include-linter/**"));
				assert(
					actual.linter!.include!.length === 1,
					`expected 1 elements in the array, got ${actual.linter!.include!.length}`,
				);
			});

			it("linter.ignore is overridden by loaded config", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.linter!.ignore!.includes("ignore-linter/**"));
				assert(
					actual.linter!.ignore!.length === 1,
					`expected 1 elements in the array, got ${actual.linter!.ignore!.length}`,
				);
			});
		});
	});

	describe("getSettingValuesFromBiomeConfig", () => {
		describe("extends from a single config", () => {
			// These variables need to be initialized once for all the tests in this describe block. Defining them outside
			// of the before block causes the tests to be skipped.
			const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
			let testConfig: BiomeConfigResolved;
			before(async () => {
				testConfig = await loadBiomeConfig(testFile);
			});

			it("formatter ignore settings are merged with root", async () => {
				const ignores = await getSettingValuesFromBiomeConfig(
					testConfig,
					"formatter",
					"ignore",
				);
				assert(ignores.has("pkg-a-ignore/**"));
				assert(ignores.has("ignore-formatter/**"));
				assert(ignores.size === 2, `expected 2 items in the set, got ${ignores.size}`);
			});

			it("linter ignore settings are merged with root", async () => {
				const ignores = await getSettingValuesFromBiomeConfig(testConfig, "linter", "ignore");
				assert(ignores.has("pkg-a-ignore/**"));
				assert(ignores.has("ignore-linter/**"));
				assert(ignores.size === 2);
			});

			it("formatter include settings are merged with root", async () => {
				const includes = await getSettingValuesFromBiomeConfig(
					testConfig,
					"formatter",
					"include",
				);
				assert(includes.has("pkg-a-include/**"));
				assert(includes.has("include-formatter/**"));
				assert(includes.size === 2);
			});

			it("linter include settings are merged with root", async () => {
				const includes = await getSettingValuesFromBiomeConfig(
					testConfig,
					"linter",
					"include",
				);
				assert(includes.has("pkg-a-include/**"));
				assert(includes.has("include-linter/**"));
				assert(includes.size === 2);
			});
		});
	});

	describe("getBiomeFormattedFilesFromDirectory", () => {
		describe("extends from a single config", () => {
			// These variables need to be initialized once for all the tests in this describe block. Defining them outside
			// of the before block causes the tests to be skipped.
			const testPath = path.resolve(testDataPath, "biome/pkg-a/");
			let gitRepo: GitRepo;
			before(async () => {
				const repoRoot = await getResolvedFluidRoot(true);
				gitRepo = new GitRepo(repoRoot);
			});

			it("returns correct file set", async () => {
				const expected = [
					path.resolve(testDataPath, "biome/pkg-a/pkg-a-include/sourceFile.ts"),
					path.resolve(
						testDataPath,
						"biome/pkg-a/pkg-a-include/include-formatter/formatter.ts",
					),
					path.resolve(testDataPath, "biome/pkg-a/pkg-a-include/include-linter/linter.ts"),
					path.resolve(testDataPath, "biome/pkg-a/include-formatter/formatter.ts"),
				];
				const formattedFiles = await getBiomeFormattedFilesFromDirectory(testPath, gitRepo);
				for (const actual of formattedFiles) {
					assert(expected.includes(actual));
				}
				assert(
					formattedFiles.length === 4,
					`expected 4 elements in the array, got ${formattedFiles.length}`,
				);
			});
		});

		describe("extends from multiple configs", () => {
			// These variables need to be initialized once for all the tests in this describe block. Defining them outside
			// of the before block causes the tests to be skipped.
			const testPath = path.resolve(testDataPath, "biome/pkg-a/extended.jsonc");
			let gitRepo: GitRepo;
			before(async () => {
				const repoRoot = await getResolvedFluidRoot(true);
				gitRepo = new GitRepo(repoRoot);
			});

			it("returns correct file set", async () => {
				const expected = [
					path.resolve(testDataPath, "biome/pkg-a/pkg-a-include/sourceFile.ts"),
					path.resolve(testDataPath, "biome/pkg-a/pkg-a-include/include-linter/linter.ts"),
					path.resolve(
						testDataPath,
						"biome/pkg-a/pkg-a-include/include-formatter/formatter.ts",
					),
					path.resolve(testDataPath, "biome/pkg-a/pkg-a-include/pkg-a-ignore/ignoredFile.ts"),
					path.resolve(testDataPath, "biome/pkg-a/include-formatter/formatter.ts"),
				];
				const formattedFiles = await getBiomeFormattedFilesFromDirectory(testPath, gitRepo);
				for (const actual of formattedFiles) {
					assert(expected.includes(actual));
				}
				assert(
					formattedFiles.length === 5,
					`expected 5 elements in the array, got ${formattedFiles.length}`,
				);
			});
		});
	});
});
