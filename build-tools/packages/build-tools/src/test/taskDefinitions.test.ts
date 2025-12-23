/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { PackageJson } from "../common/npmPackage";
import {
	type TaskDefinitionsOnDisk,
	getTaskDefinitions,
	normalizeGlobalTaskDefinitions,
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
});
