/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";

import {
	DEFAULT_GENERATION_DIR,
	DEFAULT_GENERATION_FILE_NAME,
	DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
	checkPackageCompatLayerGeneration,
	checkPackagesCompatLayerGeneration,
	deleteCompatLayerGenerationFile,
	formatCompatLayerGenerationError,
	generateLayerFileContent,
	writePackageCompatLayerGeneration,
} from "../../library/compatLayerGeneration.js";

describe("compatLayerGeneration library", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(path.join(tmpdir(), "compat-layer-test-"));
		// Create the src directory for generation files
		await mkdir(path.join(tempDir, "src"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("checkPackageCompatLayerGeneration", () => {
		it("should return needsUpdate: false for patch versions", async () => {
			const pkg = {
				version: "1.0.1", // patch version
				packageJson: {
					fluidCompatMetadata: {
						generation: 5,
						releaseDate: "2025-01-01",
						releasePkgVersion: "1.0.0",
					},
				},
				directory: tempDir,
			};

			const result = await checkPackageCompatLayerGeneration(
				pkg,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.needsUpdate, false);
			assert.strictEqual(result.needsDeletion, false);
		});

		it("should return needsUpdate: false and needsDeletion: false for packages without metadata and no file", async () => {
			const pkg = {
				version: "1.0.0",
				packageJson: {}, // no fluidCompatMetadata
				directory: tempDir,
			};

			const result = await checkPackageCompatLayerGeneration(
				pkg,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.needsUpdate, false);
			assert.strictEqual(result.needsDeletion, false);
		});

		it("should return needsDeletion: true for packages without metadata but with orphaned file", async () => {
			// Create an orphaned generation file
			const generationFilePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			await writeFile(generationFilePath, generateLayerFileContent(5));

			const pkg = {
				version: "1.0.0",
				packageJson: {}, // no fluidCompatMetadata
				directory: tempDir,
			};

			const result = await checkPackageCompatLayerGeneration(
				pkg,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.needsUpdate, false);
			assert.strictEqual(result.needsDeletion, true);
			if (result.needsDeletion) {
				assert.strictEqual(result.filePath, generationFilePath);
				assert(result.reason.includes("not opted in"));
			}
		});

		it("should return needsUpdate: true when generation file is missing", async () => {
			const pkg = {
				version: "1.0.0",
				packageJson: {
					fluidCompatMetadata: {
						generation: 5,
						releaseDate: "2025-01-01",
						releasePkgVersion: "1.0.0",
					},
				},
				directory: tempDir,
			};

			const result = await checkPackageCompatLayerGeneration(
				pkg,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.needsUpdate, true);
			if (result.needsUpdate) {
				assert.strictEqual(result.newGeneration, 5);
				assert(result.reason.includes("not found"));
			}
		});

		it("should return needsUpdate: true when file content does not match", async () => {
			// Create a generation file with wrong content
			const generationFilePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			await writeFile(generationFilePath, generateLayerFileContent(3)); // wrong generation

			const pkg = {
				version: "1.0.0",
				packageJson: {
					fluidCompatMetadata: {
						generation: 5, // metadata says 5
						releaseDate: "2025-01-01",
						releasePkgVersion: "1.0.0",
					},
				},
				directory: tempDir,
			};

			const result = await checkPackageCompatLayerGeneration(
				pkg,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.needsUpdate, true);
			if (result.needsUpdate) {
				assert.strictEqual(result.newGeneration, 5);
				assert(result.reason.includes("does not match"));
			}
		});

		it("should return needsUpdate: false when everything is up to date", async () => {
			// Create a correct generation file
			const generationFilePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			await writeFile(generationFilePath, generateLayerFileContent(5));

			const pkg = {
				version: "1.0.0",
				packageJson: {
					fluidCompatMetadata: {
						generation: 5,
						releaseDate: "2025-01-01",
						releasePkgVersion: "1.0.0",
					},
				},
				directory: tempDir,
			};

			const result = await checkPackageCompatLayerGeneration(
				pkg,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.needsUpdate, false);
			assert.strictEqual(result.needsDeletion, false);
		});
	});

	describe("checkPackagesCompatLayerGeneration", () => {
		it("should return empty arrays when no packages need updates or deletion", async () => {
			// Create a correct generation file
			const generationFilePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			await writeFile(generationFilePath, generateLayerFileContent(5));

			const packages = [
				{
					name: "test-package",
					version: "1.0.0",
					packageJson: {
						fluidCompatMetadata: {
							generation: 5,
							releaseDate: "2025-01-01",
							releasePkgVersion: "1.0.0",
						},
					},
					directory: tempDir,
				},
			];

			const result = await checkPackagesCompatLayerGeneration(
				packages,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.packagesNeedingUpdate.length, 0);
			assert.strictEqual(result.packagesNeedingDeletion.length, 0);
		});

		it("should return packages needing updates", async () => {
			const packages = [
				{
					name: "test-package",
					version: "1.0.0",
					packageJson: {
						fluidCompatMetadata: {
							generation: 5,
							releaseDate: "2025-01-01",
							releasePkgVersion: "1.0.0",
						},
					},
					directory: tempDir,
				},
			];

			const result = await checkPackagesCompatLayerGeneration(
				packages,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.packagesNeedingUpdate.length, 1);
			assert.strictEqual(result.packagesNeedingUpdate[0]?.pkg.name, "test-package");
		});

		it("should return packages needing deletion", async () => {
			// Create an orphaned generation file
			const generationFilePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			await writeFile(generationFilePath, generateLayerFileContent(5));

			const packages = [
				{
					name: "test-package",
					version: "1.0.0",
					packageJson: {}, // no fluidCompatMetadata
					directory: tempDir,
				},
			];

			const result = await checkPackagesCompatLayerGeneration(
				packages,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
				DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS,
			);

			assert.strictEqual(result.packagesNeedingDeletion.length, 1);
			assert.strictEqual(result.packagesNeedingDeletion[0]?.pkg.name, "test-package");
			assert.strictEqual(result.packagesNeedingDeletion[0]?.filePath, generationFilePath);
		});
	});

	describe("writePackageCompatLayerGeneration", () => {
		it("should write generation file and update package.json", async () => {
			// Create a package.json file
			const packageJsonPath = path.join(tempDir, "package.json");
			await writeFile(
				packageJsonPath,
				JSON.stringify({
					name: "test-package",
					version: "1.0.0",
				}),
			);

			const pkg = {
				version: "1.0.0",
				directory: tempDir,
			};

			await writePackageCompatLayerGeneration(
				pkg,
				5,
				DEFAULT_GENERATION_DIR,
				DEFAULT_GENERATION_FILE_NAME,
			);

			// Check generation file was created
			const generationFilePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			const fileContent = await readFile(generationFilePath, "utf8");
			assert(fileContent.includes("export const generation = 5;"));

			// Check package.json was updated
			const packageJsonContent = await readFile(packageJsonPath, "utf8");
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const packageJson = JSON.parse(packageJsonContent);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			assert.strictEqual(packageJson.fluidCompatMetadata.generation, 5);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			assert.strictEqual(packageJson.fluidCompatMetadata.releasePkgVersion, "1.0.0");
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions
			assert(packageJson.fluidCompatMetadata.releaseDate); // should have a date
		});
	});

	describe("deleteCompatLayerGenerationFile", () => {
		it("should delete the specified file", async () => {
			const filePath = path.join(tempDir, "src", DEFAULT_GENERATION_FILE_NAME);
			await writeFile(filePath, generateLayerFileContent(5));

			// Verify file exists
			const contentBefore = await readFile(filePath, "utf8");
			assert(contentBefore.includes("generation = 5"));

			await deleteCompatLayerGenerationFile(filePath);

			// Verify file is deleted
			await assert.rejects(
				async () => readFile(filePath, "utf8"),
				/ENOENT/, // File not found
			);
		});
	});

	describe("formatCompatLayerGenerationError", () => {
		it("should format error message without release group", () => {
			const packagesNeedingUpdate = [
				{ pkg: { name: "pkg-a" }, reason: "File missing" },
				{ pkg: { name: "pkg-b" }, reason: "Content mismatch" },
			];

			const result = formatCompatLayerGenerationError(packagesNeedingUpdate);

			assert(result.message.includes("pkg-a"));
			assert(result.message.includes("File missing"));
			assert(result.message.includes("pkg-b"));
			assert(result.message.includes("Content mismatch"));
			assert.strictEqual(result.fixCommand, "pnpm flub generate compatLayerGeneration");
		});

		it("should format error message with release group", () => {
			const packagesNeedingUpdate = [{ pkg: { name: "pkg-a" }, reason: "File missing" }];

			const result = formatCompatLayerGenerationError(packagesNeedingUpdate, "client");

			assert(result.message.includes("pkg-a"));
			assert.strictEqual(
				result.fixCommand,
				"pnpm flub generate compatLayerGeneration -g client",
			);
		});
	});
});
