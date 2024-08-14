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
	BiomeConfig,
	getBiomeFormattedFiles,
	getSettingValuesFromBiomeConfig,
	loadBiomeConfig,
} from "../common/biomeConfig";
import type { Configuration as BiomeConfigOnDisk } from "../common/biomeConfigTypes";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { GitRepo } from "../common/gitRepo";
import { testDataPath } from "./init";

describe("Biome config loading", async () => {
	describe("BiomeConfig class", async () => {
		let gitRepo: GitRepo;
		let config: BiomeConfig;
		before(async () => {
			const testDir = path.resolve(testDataPath, "biome/pkg-b");
			const repoRoot = await getResolvedFluidRoot(true);
			gitRepo = new GitRepo(repoRoot);
			config = await BiomeConfig.create(testDir, gitRepo);
		});

		it("loads", async () => {
			assert(config !== undefined);
		});

		it("has correct formatted files list", async () => {
			console.debug(config);
			const expected = [
				path.resolve(
					testDataPath,
					"biome/pkg-b/include-formatter-added-1/subdirectory/sourceFile2.ts",
				),
				path.resolve(testDataPath, "biome/pkg-b/include-formatter-added-1/sourceFile.ts"),
			];
			const { formattedFiles } = config;
			for (const actual of formattedFiles) {
				assert(expected.includes(actual));
			}
			assert(
				formattedFiles.length === 2,
				`expected 5 elements in the list, got ${formattedFiles.length}`,
			);
		});
	});

	describe("loadConfig", async () => {
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

		describe("extends from a single config", async () => {
			let testConfig: BiomeConfigOnDisk;
			before(async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				testConfig = await loadBiomeConfig(testFile);
			});

			it("top-level property is inherited", async () => {
				assert(testConfig !== undefined);
				assert(testConfig.files!.ignoreUnknown === true);
			});

			it("files.include has correct value", async () => {
				assert(testConfig.files!.include!.includes("pkg-a-include/**"));
				assert(testConfig.files!.include!.length === 1);
			});

			it("files.ignore has correct value", async () => {
				assert(testConfig.files!.ignore!.includes("pkg-a-ignore/**"));
				assert(testConfig.files!.ignore!.length === 1);
			});

			it("formatter.include has correct value", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.formatter!.include!.includes("include-formatter/**"));
				assert(actual.formatter!.include!.length === 1);
			});

			it("formatter.ignore has correct value", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.formatter!.ignore!.includes("ignore-formatter/**"));
				assert(actual.formatter!.ignore!.length === 1);
			});

			it("linter.include has correct value", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.linter!.include!.includes("include-linter/**"));
				assert(actual.linter!.include!.length === 1);
			});

			it("linter.ignore has correct value", async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
				const actual = await loadBiomeConfig(testFile);

				assert(actual.linter!.ignore!.includes("ignore-linter/**"));
				assert(actual.linter!.ignore!.length === 1);
			});
		});
	});

	describe("getSettingValuesFromBiomeConfig", async () => {
		describe("extends from a single config", async () => {
			let testConfig: BiomeConfigOnDisk;
			before(async () => {
				const testFile = path.resolve(testDataPath, "biome/pkg-a/biome.jsonc");
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
				assert(ignores.size === 2);
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

	describe("getBiomeFormattedFiles", async () => {
		describe("extends from a single config", async () => {
			let testPath: string;
			let gitRepo: GitRepo;
			before(async () => {
				const repoRoot = await getResolvedFluidRoot(true);
				gitRepo = new GitRepo(repoRoot);
				testPath = path.resolve(testDataPath, "biome/pkg-a/");
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
				const formattedFiles = await getBiomeFormattedFiles(testPath, gitRepo);
				for (const actual of formattedFiles) {
					assert(expected.includes(actual));
				}
				assert(formattedFiles.length === 4);
			});
		});

		describe("extends from multiple configs", async () => {
			let testPath: string;
			let gitRepo: GitRepo;
			before(async () => {
				const repoRoot = await getResolvedFluidRoot(true);
				gitRepo = new GitRepo(repoRoot);
				testPath = path.resolve(testDataPath, "biome/pkg-a/extended.jsonc");
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
				const formattedFiles = await getBiomeFormattedFiles(testPath, gitRepo);
				for (const actual of formattedFiles) {
					assert(expected.includes(actual));
				}
				assert(formattedFiles.length === 5);
			});
		});
	});
});
