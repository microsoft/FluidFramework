/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import type { ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";
import type { Suite } from "mocha";

import { loadModel } from "../LoadModel.js";
import {
	transformApiModel,
	type ApiItemTransformationOptions,
} from "../api-item-transforms/index.js";
import type { DocumentNode } from "../documentation-domain/index.js";

/**
 * End-to-end snapshot test configuration.
 *
 * @remarks Generates a test suite with a test for each combination of API Model and test configuration.
 */
export interface EndToEndSuiteConfig<TRenderConfig> {
	/**
	 * Name of the outer test suite.
	 */
	readonly suiteName: string;

	/**
	 * Path to the directory where all suite test output will be written for comparison against checked-in snapshots.
	 *
	 * @remarks
	 * Individual tests' output will be written to `<temporaryOutputDirectoryPath>/<{@link ApiModelTestOptions.modelName}>/<{@link ApiItemTransformationTestOptions.configName}>/<{@link RenderTestOptions.configName}>`.
	 */
	readonly temporaryOutputDirectoryPath: string;

	/**
	 * Path to the directory containing the checked-in snapshots for comparison in this suite.
	 *
	 * @remarks
	 * Individual tests' output will be written to `<temporaryOutputDirectoryPath>/<{@link ApiModelTestOptions.modelName}>/<{@link ApiItemTransformationTestOptions.configName}>/<{@link RenderTestOptions.configName}>`.
	 */
	readonly snapshotsDirectoryPath: string;

	/**
	 * The end-to-end test scenario to run against the API model.
	 * Writes the output to the specified directory for snapshot comparison.
	 */
	render(
		document: DocumentNode,
		renderConfig: TRenderConfig,
		outputDirectoryPath: string,
	): Promise<void>;

	/**
	 * The models to test.
	 */
	readonly apiModels: readonly ApiModelTestOptions[];

	/**
	 * Test configurations to run against each API Model.
	 */
	readonly testConfigs: readonly EndToEndTestConfig<TRenderConfig>[];
}

/**
 * API Model test options for a test.
 */
export interface ApiModelTestOptions {
	/**
	 * Name of the API Model being tested.
	 */
	readonly modelName: string;

	/**
	 * Path to the directory containing the API Model.
	 */
	readonly directoryPath: string;
}

/**
 * API Item transformation options for a test.
 */
export interface EndToEndTestConfig<TRenderConfig> {
	/**
	 * Test name
	 */
	readonly testName: string;

	/**
	 * The transformation configuration to use.
	 */
	readonly transformConfig: Omit<ApiItemTransformationOptions, "apiModel">;

	/**
	 * Render configuration.
	 */
	readonly renderConfig: TRenderConfig;
}

/**
 * Generates a test suite that performs end-to-end tests for each test
 * configuration x API Model combination.
 *
 * @remarks
 * The generated test suite will include the following checks:
 *
 * - Basic smoke-test validation of the API Item transformation step, ensuring unique document paths.
 *
 * - Snapshot test comparing the final rendered output against checked-in snapshots.
 */
export function endToEndTests<TRenderConfig>(
	suiteConfig: EndToEndSuiteConfig<TRenderConfig>,
): Suite {
	return describe(suiteConfig.suiteName, () => {
		for (const apiModelTestConfig of suiteConfig.apiModels) {
			const { modelName, directoryPath: modelDirectoryPath } = apiModelTestConfig;
			describe(modelName, () => {
				let apiModel: ApiModel;
				before(async () => {
					apiModel = await loadModel({ modelDirectoryPath });
				});

				for (const testConfig of suiteConfig.testConfigs) {
					const {
						testName,
						transformConfig: partialTransformConfig,
						renderConfig,
					} = testConfig;

					const testOutputPath = Path.join(modelName, testName);
					const temporaryDirectoryPath = Path.resolve(
						suiteConfig.temporaryOutputDirectoryPath,
						testOutputPath,
					);
					const snapshotDirectoryPath = Path.resolve(
						suiteConfig.snapshotsDirectoryPath,
						testOutputPath,
					);

					describe(testName, () => {
						let apiItemTransformConfig: ApiItemTransformationOptions;
						before(async () => {
							apiItemTransformConfig = {
								...partialTransformConfig,
								apiModel,
							};
						});

						// Run a sanity check to ensure that the suite did not generate multiple documents with the same
						// output file path. This either indicates a bug in the system, or an bad configuration.
						it("Ensure no duplicate file paths", () => {
							const documents = transformApiModel(apiItemTransformConfig);

							const pathMap = new Map<string, DocumentNode>();
							for (const document of documents) {
								if (pathMap.has(document.documentPath)) {
									expect.fail(
										`Rendering generated multiple documents to be rendered to the same file path.`,
									);
								} else {
									pathMap.set(document.documentPath, document);
								}
							}
						});

						// Perform actual output snapshot comparison test against checked-in test collateral.
						it("Snapshot test", async () => {
							// Ensure the output temp and snapshots directories exists (will create an empty ones if they don't).
							await FileSystem.ensureFolderAsync(temporaryDirectoryPath);
							await FileSystem.ensureFolderAsync(snapshotDirectoryPath);

							// Clear any existing test_temp data
							await FileSystem.ensureEmptyFolderAsync(temporaryDirectoryPath);

							const documents = transformApiModel(apiItemTransformConfig);

							await Promise.all(
								documents.map(async (document) =>
									suiteConfig.render(
										document,
										renderConfig,
										temporaryDirectoryPath,
									),
								),
							);

							await compareDocumentationSuiteSnapshot(
								snapshotDirectoryPath,
								temporaryDirectoryPath,
							);
						});
					});
				}
			});
		}
	});
}

/**
 * Compares "expected" to "actual" documentation test suite output.
 * Succeeds the Mocha test if the directory contents match.
 * Otherwise, fails the test and copies the new output to the snapshot directory so the developer can view the diff
 * in git, and check in the changes if appropriate.
 *
 * @param snapshotDirectoryPath - Resolved path to the directory containing the checked-in assets for the test.
 * Represents the "expected" test output.
 *
 * @param temporaryDirectoryPath - Resolved path to the directory containing the freshly generated test output.
 * Represents the "actual" test output.
 */
async function compareDocumentationSuiteSnapshot(
	snapshotDirectoryPath: string,
	temporaryDirectoryPath: string,
): Promise<void> {
	// Verify against expected contents
	const result = await compare(temporaryDirectoryPath, snapshotDirectoryPath, {
		compareContent: true,
	});

	if (!result.same) {
		await FileSystem.ensureEmptyFolderAsync(snapshotDirectoryPath);
		await FileSystem.copyFilesAsync({
			sourcePath: temporaryDirectoryPath,
			destinationPath: snapshotDirectoryPath,
		});

		expect.fail(`Snapshot test encountered ${result.differencesFiles} file diffs.`);
	}
}
