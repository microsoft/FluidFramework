/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import type { ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";

import {
	transformApiModel,
	type ApiItemTransformationConfiguration,
} from "../api-item-transforms/index.js";
import type { Suite } from "mocha";
import { loadModel } from "../LoadModel.js";
import type { DocumentNode } from "../documentation-domain/index.js";

/**
 * End-to-end snapshot test configuration.
 */
export interface EndToEndTestConfig<TRenderConfig> {
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
	 * The transformation configurations to test.
	 */
	readonly transformConfigs: readonly ApiItemTransformationTestOptions[];

	/**
	 * The render configurations to test.
	 */
	readonly renderConfigs: readonly RenderTestOptions<TRenderConfig>[];
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
export interface ApiItemTransformationTestOptions {
	/**
	 * Name of the API Item transformation variant being tested.
	 */
	readonly configName: string;

	/**
	 * The transformation configuration to use.
	 */
	readonly transformConfig: Omit<ApiItemTransformationConfiguration, "apiModel">;
}

/**
 * Render options for a test.
 */
export interface RenderTestOptions<TRenderConfig> {
	/**
	 * Name of the rendering scenario being tested.
	 */
	readonly configName: string;

	/**
	 * Render configuration.
	 */
	readonly renderConfig: TRenderConfig;
}

/**
 * Runs an end-to-end snapshot test for the provided API Model configurations.
 */
export function endToEndTestSuite<TRenderConfig>(
	suiteConfig: EndToEndTestConfig<TRenderConfig>,
): Suite {
	return describe(suiteConfig.suiteName, () => {
		for (const apiModelTestConfig of suiteConfig.apiModels) {
			const { modelName, directoryPath: modelDirectoryPath } = apiModelTestConfig;
			describe(modelName, () => {
				let apiModel: ApiModel;
				before(async () => {
					apiModel = await loadModel({ modelDirectoryPath });
				});

				for (const apiItemTransformTestConfig of suiteConfig.transformConfigs) {
					const {
						configName: transformConfigName,
						transformConfig: partialTransformConfig,
					} = apiItemTransformTestConfig;
					describe(transformConfigName, () => {
						let apiItemTransformConfig: ApiItemTransformationConfiguration;
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

						for (const renderTestConfig of suiteConfig.renderConfigs) {
							const { configName: renderConfigName, renderConfig } = renderTestConfig;

							const testOutputPath = createTestOutputPath(
								modelName,
								transformConfigName,
								renderConfigName,
							);
							const temporaryDirectoryPath = Path.resolve(
								suiteConfig.temporaryOutputDirectoryPath,
								testOutputPath,
							);
							const snapshotDirectoryPath = Path.resolve(
								suiteConfig.snapshotsDirectoryPath,
								testOutputPath,
							);

							describe(renderConfigName, () => {
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
	});
}

function createTestOutputPath(
	modelName: string,
	apiItemTransformationConfigName: string,
	renderConfigName: string,
): string {
	return Path.join(modelName, apiItemTransformationConfigName, renderConfigName);
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
export async function compareDocumentationSuiteSnapshot(
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
