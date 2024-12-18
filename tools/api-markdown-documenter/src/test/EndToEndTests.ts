/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Path from "node:path";

import { ApiItemKind, type ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";
import type { Suite } from "mocha";

import {
	ApiItemUtilities,
	loadModel,
	type DocumentHierarchyConfig,
	type DocumentNode,
	FolderDocumentPlacement,
	HierarchyKind,
	type HierarchyOptions,
	transformApiModel,
	type MarkdownRenderer,
	type HtmlRenderer,
	type ApiItemTransformationOptions,
	type FolderHierarchyConfig,
	type SectionHierarchyConfig,
} from "../index.js";

/**
 * Supported render configuration types.
 */
export type RenderConfig =
	| MarkdownRenderer.RenderDocumentsOptions
	| HtmlRenderer.RenderDocumentsOptions;

/**
 * End-to-end snapshot test configuration.
 *
 * @remarks Generates a test suite with a test for each combination of API Model and test configuration.
 */
export interface EndToEndSuiteConfig<TRenderConfig extends RenderConfig> {
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
	render(document: DocumentNode, config: TRenderConfig): Promise<void>;

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
export interface EndToEndTestConfig<TRenderConfig extends RenderConfig> {
	/**
	 * Test name
	 */
	readonly testName: string;

	/**
	 * Transformation / render configuration
	 */
	readonly renderConfig: Omit<ApiItemTransformationOptions, "apiModel"> &
		Omit<TRenderConfig, "outputDirectoryPath">;
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
export function endToEndTests<const TRenderConfig extends RenderConfig>(
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
					const testOutputPath = Path.join(modelName, testConfig.testName);
					const temporaryDirectoryPath = Path.resolve(
						suiteConfig.temporaryOutputDirectoryPath,
						testOutputPath,
					);
					const snapshotDirectoryPath = Path.resolve(
						suiteConfig.snapshotsDirectoryPath,
						testOutputPath,
					);

					describe(testConfig.testName, () => {
						let config: ApiItemTransformationOptions & TRenderConfig;
						before(async () => {
							config = {
								...testConfig.renderConfig,
								apiModel,
								outputDirectoryPath: temporaryDirectoryPath,
							} as unknown as ApiItemTransformationOptions & TRenderConfig;
						});

						// Run a sanity check to ensure that the suite did not generate multiple documents with the same
						// output file path. This either indicates a bug in the system, or an bad configuration.
						it("Ensure no duplicate file paths", () => {
							const documents = transformApiModel(config);

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

							const documents = transformApiModel(config);

							await Promise.all(
								documents.map(async (document) =>
									suiteConfig.render(document, config),
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
 * Test hierarchy configs
 *
 * @privateRemarks TODO: Formalize and export some of these as pre-canned solutions?
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace HierarchyConfigs {
	const defaultSectionConfig: SectionHierarchyConfig = {
		kind: HierarchyKind.Section,
		headingText: (apiItem) => apiItem.displayName,
	};

	const defaultDocumentConfig: DocumentHierarchyConfig = {
		kind: HierarchyKind.Document,
		documentName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		headingText: (apiItem) => apiItem.displayName,
	};

	const outsideFolderConfig: FolderHierarchyConfig = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Outside,
		documentName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		folderName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		headingText: (apiItem) => apiItem.displayName,
	};

	const insideFolderConfig: FolderHierarchyConfig = {
		kind: HierarchyKind.Folder,
		documentPlacement: FolderDocumentPlacement.Inside,
		documentName: "index",
		folderName: (apiItem) => ApiItemUtilities.getFileSafeNameForApiItem(apiItem),
		headingText: (apiItem) => apiItem.displayName,
	};

	/**
	 * "Flat" hierarchy: Packages get their own documents, and all descendent API items are rendered as sections under that document.
	 * @remarks Results in a small number of documents, but can lead to relatively large documents.
	 */
	export const flat: Partial<HierarchyOptions> = {
		[ApiItemKind.Package]: outsideFolderConfig,

		[ApiItemKind.CallSignature]: defaultSectionConfig,
		[ApiItemKind.Class]: defaultSectionConfig,
		[ApiItemKind.Constructor]: defaultSectionConfig,
		[ApiItemKind.ConstructSignature]: defaultSectionConfig,
		[ApiItemKind.Enum]: defaultSectionConfig,
		[ApiItemKind.EnumMember]: defaultSectionConfig,
		[ApiItemKind.Function]: defaultSectionConfig,
		[ApiItemKind.IndexSignature]: defaultSectionConfig,
		[ApiItemKind.Interface]: defaultSectionConfig,
		[ApiItemKind.Method]: defaultSectionConfig,
		[ApiItemKind.MethodSignature]: defaultSectionConfig,
		[ApiItemKind.Property]: defaultSectionConfig,
		[ApiItemKind.PropertySignature]: defaultSectionConfig,
		[ApiItemKind.TypeAlias]: defaultSectionConfig,
		[ApiItemKind.Variable]: defaultSectionConfig,
	};

	/**
	 * "Sparse" hierarchy: Packages yield folder hierarchy, and all descendent items get their own document under that folder.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const sparse: Partial<HierarchyOptions> = {
		[ApiItemKind.Package]: outsideFolderConfig,

		[ApiItemKind.CallSignature]: defaultDocumentConfig,
		[ApiItemKind.Class]: defaultDocumentConfig,
		[ApiItemKind.Constructor]: defaultDocumentConfig,
		[ApiItemKind.ConstructSignature]: defaultDocumentConfig,
		[ApiItemKind.Enum]: defaultDocumentConfig,
		[ApiItemKind.EnumMember]: defaultDocumentConfig,
		[ApiItemKind.Function]: defaultDocumentConfig,
		[ApiItemKind.IndexSignature]: defaultDocumentConfig,
		[ApiItemKind.Interface]: defaultDocumentConfig,
		[ApiItemKind.Method]: defaultDocumentConfig,
		[ApiItemKind.MethodSignature]: defaultDocumentConfig,
		[ApiItemKind.Namespace]: defaultDocumentConfig,
		[ApiItemKind.Property]: defaultDocumentConfig,
		[ApiItemKind.PropertySignature]: defaultDocumentConfig,
		[ApiItemKind.TypeAlias]: defaultDocumentConfig,
		[ApiItemKind.Variable]: defaultDocumentConfig,
	};

	/**
	 * "Deep" hierarchy: All "parent" API items generate hierarchy. All other items are rendered as documents under their parent hierarchy.
	 * @remarks Leads to many documents, but each document is likely to be relatively small.
	 */
	export const deep: Partial<HierarchyOptions> = {
		// Items that introduce folder hierarchy:
		[ApiItemKind.Namespace]: insideFolderConfig,
		[ApiItemKind.Package]: insideFolderConfig,
		[ApiItemKind.Class]: insideFolderConfig,
		[ApiItemKind.Enum]: insideFolderConfig,
		[ApiItemKind.Interface]: insideFolderConfig,
		[ApiItemKind.TypeAlias]: insideFolderConfig,

		// Items that get their own document, but do not introduce folder hierarchy:
		[ApiItemKind.CallSignature]: defaultDocumentConfig,
		[ApiItemKind.Constructor]: defaultDocumentConfig,
		[ApiItemKind.ConstructSignature]: defaultDocumentConfig,
		[ApiItemKind.EnumMember]: defaultDocumentConfig,
		[ApiItemKind.Function]: defaultDocumentConfig,
		[ApiItemKind.IndexSignature]: defaultDocumentConfig,
		[ApiItemKind.Method]: defaultDocumentConfig,
		[ApiItemKind.MethodSignature]: defaultDocumentConfig,
		[ApiItemKind.Property]: defaultDocumentConfig,
		[ApiItemKind.PropertySignature]: defaultDocumentConfig,
		[ApiItemKind.Variable]: defaultDocumentConfig,
	};
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
