/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as utils from "../type-test-generator/typeTestUtils";
import * as fs from "fs";
import * as path from "path";
import { PackageJson } from "../common/npmPackage";
import { IExtractorConfigPrepareOptions } from "@microsoft/api-extractor";

/**
 * Mock package.json object for testing.
 */
const mockPackageObject: PackageJson = {
	name: "mockPackageForTesting",
	description: "Mock package.json",
	version: "1.0.0",
	scripts: {},
	devDependencies: {
		"dependency1": "1.0.0",
		"dependency2": "2.0.0",
		"mockPackage-previous": "1.2.3",
	},
};

/**
 * Unit tests for the abstracted functions in typeTestUtils.
 */
describe("typeTestUtils", () => {
	const packageObject: PackageJson = mockPackageObject;
	const previousPackageName = `${packageObject.name}-previous`;

	describe("ensureDevDependencyExists", () => {
		it("Should not throw an error if dev dependency exists", () => {
			utils.ensureDevDependencyExists(packageObject, "dependency1");
		});

		it("Should throw an error if dev dependency does not exist", () => {
			const previousPackageName = `${packageObject.name}-does-not-exist`;
			assert.throws(
				() => utils.ensureDevDependencyExists(packageObject, previousPackageName),
				/Error: Did not find devDependency in package.json/,
			);
		});
	});

	describe("getPreviousPackageJsonPath", () => {
		const nodeModulesDir = path.join(__dirname, "node_modules");
		// Create temp directory structure
		before(() => {
			fs.mkdirSync(nodeModulesDir);
			fs.mkdirSync(path.join(nodeModulesDir, previousPackageName));
			fs.writeFileSync(
				path.join(nodeModulesDir, previousPackageName, "package.json"),
				JSON.stringify({
					name: "mockPackageForTesting-previous",
					version: "1.2.3",
				}),
				"utf-8",
			);
		});

		after(() => {
			fs.rmSync(nodeModulesDir, { recursive: true });
		});

		it("Should return the path to the previous package.json", () => {
			const previousBasePath = path.join(nodeModulesDir, previousPackageName);
			const result = utils.tryGetPreviousPackageJsonPath(previousBasePath);
			const expectedPath = path.join(previousBasePath, "package.json");
			assert.strictEqual(result, expectedPath);
		});

		it("Should return undefined if the previous package.json path does not exist", () => {
			const previousBasePath = path.join(nodeModulesDir, "does-not-exist");
			assert.throws(() => utils.tryGetPreviousPackageJsonPath(previousBasePath));
		});
	});

	describe("getTypeRollupPathFromExtractorConfig", () => {
		// Create temp directory for testing
		const nodeModulesDir = path.join(__dirname, "node_modules");
		const previousBasePath = path.join(nodeModulesDir, previousPackageName);
		let extractorConfigOptions: IExtractorConfigPrepareOptions;

		before(() => {
			fs.mkdirSync(nodeModulesDir);
			fs.mkdirSync(previousBasePath);
		});

		after(() => {
			fs.rmSync(nodeModulesDir, { recursive: true });
		});

		it("Should return undefined if API Extractor config is not found", () => {
			const result = utils.getTypeRollupPathFromExtractorConfig(
				"alpha",
				extractorConfigOptions,
			);
			assert.strictEqual(result, undefined);
		});

		it("Should return undefined if dtsRollup config is not found", () => {
			fs.writeFileSync(path.join(previousBasePath, "api-extractor.json"), "{}");
			const result = utils.getTypeRollupPathFromExtractorConfig(
				"alpha",
				extractorConfigOptions,
			);
			assert.strictEqual(result, undefined);
			fs.rmSync(path.join(previousBasePath, "api-extractor.json"));
		});

		it("Should return undefined if rollup path for the specified type is not found", () => {
			extractorConfigOptions = {
				configObject: {
					mainEntryPointFilePath: "",
					dtsRollup: {
						enabled: true,
						untrimmedFilePath: "untrimmed.d.ts",
					},
				},
				configObjectFullPath: "",
				packageJsonFullPath: "",
			};
			const result = utils.getTypeRollupPathFromExtractorConfig(
				"alpha",
				extractorConfigOptions,
			);
			assert.strictEqual(result, undefined);
		});

		it("Should return the rollup path for the specified type", () => {
			extractorConfigOptions = {
				configObject: {
					mainEntryPointFilePath: "",
					dtsRollup: {
						enabled: true,
						alphaTrimmedFilePath: "alpha.d.ts",
					},
				},
				configObjectFullPath: "",
				packageJsonFullPath: "",
			};
			const result = utils.getTypeRollupPathFromExtractorConfig(
				"alpha",
				extractorConfigOptions,
			);
			assert.strictEqual(result, "alpha.d.ts");
		});
	});

	describe("getTypePathFromExport", () => {
		const nodeModulesDir = path.join(__dirname, "node_modules");
		const previousBasePath = path.join(nodeModulesDir, previousPackageName);

		after(() => {
			fs.rmSync(nodeModulesDir, { recursive: true });
		});

		it("should return undefined if exports field is missing", () => {
			const result = utils.getTypePathFromExport(packageObject, previousBasePath);
			assert.strictEqual(result, undefined);
		});

		it("should throw an error if both import and require resolutions are missing", () => {
			packageObject.exports = { ".": {} };

			assert.throws(
				() => utils.getTypePathFromExport(packageObject, previousBasePath),
				/Type definition file path could not be determined from the 'exports' field using the default export entry '.'/,
			);
		});

		it("should return the type definition file path if it exists in exports", () => {
			packageObject.exports = {
				".": {
					import: {
						types: "./lib/index.d.ts",
					},
				},
			};
			const result = utils.getTypePathFromExport(packageObject, previousBasePath);
			const expectedPath = path.join(previousBasePath, "lib/index.d.ts");
			assert.strictEqual(result, expectedPath);
		});

		it("should throw an error if both import and require resolutions do not provide types", () => {
			packageObject.exports = {
				".": {
					import: {
						default: "./lib/index.mjs",
					},
				},
			};
			fs.mkdirSync(nodeModulesDir);
			fs.mkdirSync(previousBasePath);
			fs.writeFileSync(
				path.join(previousBasePath, "package.json"),
				JSON.stringify({
					name: "mockPackageForTesting-previous",
					version: "1.2.3",
					types: "index.d.ts",
					exports: {
						".": {
							import: "./lib/index.mjs",
							require: "./dis/index.js",
						},
					},
				}),
				"utf-8",
			);
			assert.throws(
				() => utils.getTypePathFromExport(packageObject, previousBasePath),
				/Type definition file path could not be determined from the 'exports' field using the default export entry '.'/,
			);
		});
	});

	describe("getTypeDefinitionFilePath", () => {
		const nodeModulesDir = path.join(__dirname, "node_modules");
		const previousBasePath = path.join(nodeModulesDir, previousPackageName);

		before(() => {
			fs.mkdirSync(nodeModulesDir);
			fs.mkdirSync(previousBasePath);
			fs.writeFileSync(
				path.join(previousBasePath, "package.json"),
				JSON.stringify({
					name: "mockPackageForTesting-previous",
					version: "1.2.3",
					types: "index.d.ts",
				}),
				"utf-8",
			);
		});

		after(() => {
			fs.rmSync(nodeModulesDir, { recursive: true });
		});

		it("should return the type definition file path if it exists in the package.json", () => {
			const result = utils.getTypeDefinitionFilePath(previousBasePath);
			const expectedPath = path.join(previousBasePath, "index.d.ts");
			assert.strictEqual(result, expectedPath);
		});

		it("should throw an error if the type definition file path does not exist in the package.json", () => {
			fs.writeFileSync(
				path.join(previousBasePath, "package.json"),
				JSON.stringify({
					name: "mockPackageForTesting-previous",
					version: "1.2.3",
				}),
				"utf-8",
			);

			assert.throws(() => utils.getTypeDefinitionFilePath(previousBasePath));
		});
	});
});
