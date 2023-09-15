/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem, NewlineKind } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";
import { Suite } from "mocha";

import { renderApiModelAsMarkdown } from "../RenderMarkdown";
import { type ApiItemTransformationConfiguration, transformApiModel } from "../api-item-transforms";
import { DocumentNode } from "../documentation-domain";
import { type MarkdownRenderConfiguration } from "../markdown-renderer";

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTempDirPath = Path.resolve(__dirname, "test_temp");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to dist/test
 */
const snapshotsDirPath = Path.resolve(__dirname, "..", "..", "src", "test", "snapshots");

// Relative to dist/test
const testDataDirPath = Path.resolve(__dirname, "..", "..", "src", "test", "test-data");
const testModelPaths = [Path.resolve(testDataDirPath, "simple-suite-test.json")];

/**
 * Simple integration test that validates complete output from simple test package.
 *
 * @param relativeSnapshotDirectoryPath - Path to the test output (relative to the test directory).
 * Used when outputting raw contents, and when copying those contents to update generate / update snapshots.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
async function snapshotTest(
	relativeSnapshotDirectoryPath: string,
	transformConfig: ApiItemTransformationConfiguration,
	renderConfig: MarkdownRenderConfiguration,
): Promise<void> {
	const outputDirectoryPath = Path.resolve(testTempDirPath, relativeSnapshotDirectoryPath);
	const snapshotDirectoryPath = Path.resolve(snapshotsDirPath, relativeSnapshotDirectoryPath);

	// Ensure the output temp and snapshots directories exists (will create an empty ones if they don't).
	await FileSystem.ensureFolderAsync(outputDirectoryPath);
	await FileSystem.ensureFolderAsync(snapshotDirectoryPath);

	// Clear any existing test_temp data
	await FileSystem.ensureEmptyFolderAsync(outputDirectoryPath);

	// Run transformation and rendering logic
	const fileSystemConfig = {
		outputDirectoryPath,
		newlineKind: NewlineKind.Lf,
	};
	await renderApiModelAsMarkdown(transformConfig, renderConfig, fileSystemConfig);

	// Verify against expected contents
	const result = await compare(outputDirectoryPath, snapshotDirectoryPath, {
		compareContent: true,
	});

	if (!result.same) {
		await FileSystem.ensureEmptyFolderAsync(snapshotDirectoryPath);
		await FileSystem.copyFilesAsync({
			sourcePath: outputDirectoryPath,
			destinationPath: snapshotDirectoryPath,
		});
	}

	// If this fails, then the docs build has generated new content.
	// View the diff in git and determine if the changes are appropriate or not.
	expect(result.same).to.be.true;
}

/**
 * Input props for {@link apiTestSuite}.
 */
interface ConfigTestProps {
	/**
	 * Name of the config to be used in naming of the test-suite
	 */
	configName: string;

	/**
	 * The API Item transform config to use, except the `apiModel`, which will be instantiated in test set-up.
	 */
	transformConfigLessApiModel: Omit<ApiItemTransformationConfiguration, "apiModel">;

	/**
	 * The Markdown rendering config to use.
	 */
	renderConfig: MarkdownRenderConfiguration;
}

/**
 * Runs a full-suite test for the provided Model name against the provided list of configs.
 *
 * @remarks
 * Snapshots are generated under `./snapshots` within sub-directories generated for each <package-name>, <config-name>
 * pair. These snapshots are checked in. Evaluating test diffs can be accomplished by looking at the git-wise diff.
 * If a change in the Markdown rendering is expected, it should be checked in.
 *
 * @param modelName - Name of the model for which the docs are being generated.
 * @param apiReportFilePaths - List of paths to package API report files to be loaded into the model.
 * @param configs - Configurations to test against.
 */
function apiTestSuite(
	modelName: string,
	apiReportFilePaths: string[],
	configs: ConfigTestProps[],
): Suite {
	return describe(modelName, () => {
		for (const configProps of configs) {
			describe(configProps.configName, () => {
				/**
				 * Complete transform config used in tests. Generated in `before` hook.
				 */
				let transformConfig: ApiItemTransformationConfiguration;

				/**
				 * Complete Markdown render config used in tests. Generated in `before` hook.
				 */
				let renderConfig: MarkdownRenderConfiguration;

				before(async () => {
					const apiModel = new ApiModel();
					for (const apiReportFilePath of apiReportFilePaths) {
						apiModel.loadPackage(apiReportFilePath);
					}

					transformConfig = {
						...configProps.transformConfigLessApiModel,
						apiModel,
					};

					renderConfig = configProps.renderConfig;
				});

				it("Ensure no duplicate file paths", () => {
					const documents = transformApiModel(transformConfig);

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

				it("Snapshot test", async () => {
					await snapshotTest(
						Path.join(modelName, configProps.configName),
						transformConfig,
						renderConfig,
					);
				});
			});
		}
	});
}

describe("api-markdown-documenter full-suite tests", () => {
	const configs: ConfigTestProps[] = [
		/**
		 * Sample "default" configuration.
		 */
		{
			configName: "default-config",
			transformConfigLessApiModel: {
				uriRoot: ".",
				frontMatter: "<!-- Front Matter! -->",
			},
			renderConfig: {},
		},

		/**
		 * A sample "flat" configuration, which renders every item kind under a package to the package parent document.
		 */
		{
			configName: "flat-config",
			transformConfigLessApiModel: {
				uriRoot: "docs",
				includeBreadcrumb: true,
				includeTopLevelDocumentHeading: false,
				documentBoundaries: [], // Render everything to package documents
				hierarchyBoundaries: [], // No additional hierarchy beyond the package level
				frontMatter: (documentItem): string =>
					`<!--- This is sample front-matter for API item "${documentItem.displayName}" -->`,
			},
			renderConfig: {},
		},

		/**
		 * A sample "sparse" configuration, which renders every item kind to its own document.
		 */
		{
			configName: "sparse-config",
			transformConfigLessApiModel: {
				uriRoot: "docs",
				includeBreadcrumb: false,
				includeTopLevelDocumentHeading: true,
				// Render everything to its own document
				documentBoundaries: [
					ApiItemKind.CallSignature,
					ApiItemKind.Class,
					ApiItemKind.ConstructSignature,
					ApiItemKind.Constructor,
					ApiItemKind.Enum,
					ApiItemKind.EnumMember,
					ApiItemKind.Function,
					ApiItemKind.IndexSignature,
					ApiItemKind.Interface,
					ApiItemKind.Method,
					ApiItemKind.MethodSignature,
					ApiItemKind.Namespace,
					ApiItemKind.Property,
					ApiItemKind.PropertySignature,
					ApiItemKind.TypeAlias,
					ApiItemKind.Variable,
				],
				hierarchyBoundaries: [], // No additional hierarchy beyond the package level
			},
			renderConfig: {
				startingHeadingLevel: 2,
			},
		},
	];

	before(async () => {
		// Ensure the output temp and snapshots directories exists (will create an empty ones if they don't).
		await FileSystem.ensureFolderAsync(testTempDirPath);
		await FileSystem.ensureFolderAsync(snapshotsDirPath);

		// Clear test temp dir before test run to make sure we are running from a clean state.
		await FileSystem.ensureEmptyFolderAsync(testTempDirPath);
	});

	// Run the test suite against a sample report
	apiTestSuite("simple-suite-test", testModelPaths, configs);
});
