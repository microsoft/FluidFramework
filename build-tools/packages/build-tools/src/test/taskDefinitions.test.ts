/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { PackageJson } from "../common/npmPackage";
import {
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
	type TaskDefinitionsOnDisk,
} from "../fluidBuild/fluidTaskDefinitions";

describe("Task Definitions", () => {
	describe("File Dependencies Extension", () => {
		it("extends inputGlobs from global config when using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts", "package.json"],
						outputGlobs: ["dist/**/*.js"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["...", "extra/**/*.ts"],
								outputGlobs: ["..."],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, [
				"extra/**/*.ts",
				"src/**/*.ts",
				"package.json",
			]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, ["dist/**/*.js"]);
		});

		it("extends outputGlobs from global config when using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js", "dist/**/*.d.ts"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["..."],
								outputGlobs: ["...", "dist/**/*.map"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, ["src/**/*.ts"]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, [
				"dist/**/*.map",
				"dist/**/*.js",
				"dist/**/*.d.ts",
			]);
		});

		it("supports extending both inputGlobs and outputGlobs", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["...", "config/*.json"],
								outputGlobs: ["...", "dist/**/*.d.ts"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, [
				"config/*.json",
				"src/**/*.ts",
			]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, [
				"dist/**/*.d.ts",
				"dist/**/*.js",
			]);
		});

		it("works without global file dependencies", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["...", "src/**/*.ts"],
								outputGlobs: ["...", "dist/**/*.js"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// "..." expands to empty when there are no inherited values
			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, ["src/**/*.ts"]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, ["dist/**/*.js"]);
		});

		it("replaces file dependencies when '...' is not used", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					myTask: "echo test",
				},
				fluidBuild: {
					tasks: {
						myTask: {
							dependsOn: [],
							files: {
								inputGlobs: ["lib/**/*.ts"], // No "..." - replaces instead of extends
								outputGlobs: ["build/**/*.js"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Without "...", the package-level definition completely replaces the global one
			assert.deepStrictEqual(taskDefinitions.myTask.files?.inputGlobs, ["lib/**/*.ts"]);
			assert.deepStrictEqual(taskDefinitions.myTask.files?.outputGlobs, ["build/**/*.js"]);
		});
	});

	describe("Additional Config Files", () => {
		it("extends additionalConfigFiles from global config when using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["../../.eslintrc.cjs", "../../eslint-common.json"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["...", ".eslintrc.local.json"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				".eslintrc.local.json",
				"../../.eslintrc.cjs",
				"../../eslint-common.json",
			]);
		});

		it("works without global additionalConfigFiles", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["...", "../../.eslintrc.cjs"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// "..." expands to empty when there are no inherited values
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"../../.eslintrc.cjs",
			]);
		});

		it("replaces additionalConfigFiles when '...' is not used", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["../../.eslintrc.cjs"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: [".eslintrc.local.json"], // No "..." - replaces
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Without "...", the package-level definition completely replaces the global one
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				".eslintrc.local.json",
			]);
		});
	});

	describe("Global Task Definition Validation", () => {
		it("throws error when '...' is used in global additionalConfigFiles", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["...", "some-config.json"],
					},
				},
			};

			assert.throws(
				() => normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk),
				/Invalid 'files.additionalConfigFiles' dependencies '...' for global task definition eslint/,
			);
		});

		it("throws error when '...' is used in global inputGlobs", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: ["...", "src/**/*.ts"],
						outputGlobs: [],
					},
				},
			};

			assert.throws(
				() => normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk),
				/Invalid 'files.inputGlobs' dependencies '...' for global task definition myTask/,
			);
		});

		it("throws error when '...' is used in global outputGlobs", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				myTask: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: ["...", "dist/**/*.js"],
					},
				},
			};

			assert.throws(
				() => normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk),
				/Invalid 'files.outputGlobs' dependencies '...' for global task definition myTask/,
			);
		});

		it("allows valid global task definitions without '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: ["dist/**/*.js"],
						additionalConfigFiles: ["${repoRoot}/.eslintrc.cjs"],
					},
				},
			};

			// Should not throw
			const result = normalizeGlobalTaskDefinitions(globalTaskDefinitionsOnDisk);
			assert.deepStrictEqual(result.eslint.files?.additionalConfigFiles, [
				"${repoRoot}/.eslintrc.cjs",
			]);
		});
	});

	describe("Task Definition Resolution", () => {
		it("returns additionalConfigFiles from resolved task definition", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: ["src/**/*.ts"],
						outputGlobs: [],
						additionalConfigFiles: ["${repoRoot}/.eslintrc.cjs"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Verify the task definition contains the additionalConfigFiles
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"${repoRoot}/.eslintrc.cjs",
			]);
		});

		it("returns empty array when no additionalConfigFiles defined", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// additionalConfigFiles should be undefined when not specified
			assert.strictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, undefined);
		});

		it("preserves ${repoRoot} tokens in additionalConfigFiles for later resolution", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: [
							"${repoRoot}/.eslintrc.cjs",
							"${repoRoot}/common/eslint-config.json",
							"./local-config.json",
						],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Tokens should be preserved - they're resolved later by the task handler
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"${repoRoot}/.eslintrc.cjs",
				"${repoRoot}/common/eslint-config.json",
				"./local-config.json",
			]);
		});

		it("combines package additionalConfigFiles with global using '...'", () => {
			const globalTaskDefinitionsOnDisk: TaskDefinitionsOnDisk = {
				eslint: {
					dependsOn: [],
					files: {
						inputGlobs: [],
						outputGlobs: [],
						additionalConfigFiles: ["${repoRoot}/.eslintrc.cjs"],
					},
				},
			};

			const globalTaskDefinitions = normalizeGlobalTaskDefinitions(
				globalTaskDefinitionsOnDisk,
			);

			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				scripts: {
					eslint: "eslint src",
				},
				fluidBuild: {
					tasks: {
						eslint: {
							dependsOn: [],
							files: {
								inputGlobs: [],
								outputGlobs: [],
								additionalConfigFiles: ["...", "./package-local.json"],
							},
						},
					},
				},
			};

			const taskDefinitions = getTaskDefinitions(packageJson, globalTaskDefinitions, {
				isReleaseGroupRoot: false,
			});

			// Package-local files come first, then inherited global files
			assert.deepStrictEqual(taskDefinitions.eslint.files?.additionalConfigFiles, [
				"./package-local.json",
				"${repoRoot}/.eslintrc.cjs",
			]);
		});
	});
});
