/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as Path from "node:path";

import { ApiItemKind, ApiModel, ReleaseTag } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { type Suite } from "mocha";

import { renderApiModelAsHtml } from "../RenderHtml";
import { type ApiItemTransformationConfiguration, transformApiModel } from "../api-item-transforms";
import { type DocumentNode } from "../documentation-domain";
import { type HtmlRenderConfiguration } from "../renderers";
import { compareDocumentationSuiteSnapshot } from "./SnapshotTestUtilities";

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTemporaryDirectoryPath = Path.resolve(__dirname, "test_temp", "html");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to dist/test
 */
const snapshotsDirectoryPath = Path.resolve(
	__dirname,
	"..",
	"..",
	"src",
	"test",
	"snapshots",
	"html",
);

// Relative to dist/test
const testDataDirectoryPath = Path.resolve(__dirname, "..", "..", "src", "test", "test-data");
const testModelPaths = [Path.resolve(testDataDirectoryPath, "simple-suite-test.json")];

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
	renderConfig: HtmlRenderConfiguration,
): Promise<void> {
	const outputDirectoryPath = Path.resolve(
		testTemporaryDirectoryPath,
		relativeSnapshotDirectoryPath,
	);
	const snapshotDirectoryPath = Path.resolve(
		snapshotsDirectoryPath,
		relativeSnapshotDirectoryPath,
	);

	await compareDocumentationSuiteSnapshot(
		snapshotDirectoryPath,
		outputDirectoryPath,
		async (fsConfig) => renderApiModelAsHtml(transformConfig, renderConfig, fsConfig),
	);
}

/**
 * Input props for {@link apiTestSuite}.
 */
interface ConfigurationTestProperties {
	/**
	 * Name of the config to be used in naming of the test-suite
	 */
	configName: string;

	/**
	 * The API Item transform config to use, except the `apiModel`, which will be instantiated in test set-up.
	 */
	transformConfigLessApiModel: Omit<ApiItemTransformationConfiguration, "apiModel">;

	/**
	 * The HTML rendering config to use.
	 */
	renderConfig: HtmlRenderConfiguration;
}

/**
 * Runs a full-suite test for the provided Model name against the provided list of configs.
 *
 * @remarks
 * Snapshots are generated under `./snapshots/markdown` within sub-directories generated for each <package-name>, <config-name>
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
	configs: ConfigurationTestProperties[],
): Suite {
	return describe(modelName, () => {
		for (const configurationProperties of configs) {
			describe(configurationProperties.configName, () => {
				/**
				 * Complete transform config used in tests. Generated in `before` hook.
				 */
				let transformConfig: ApiItemTransformationConfiguration;

				/**
				 * Complete HTML render config used in tests. Generated in `before` hook.
				 */
				let renderConfig: HtmlRenderConfiguration;

				before(async () => {
					const apiModel = new ApiModel();
					for (const apiReportFilePath of apiReportFilePaths) {
						apiModel.loadPackage(apiReportFilePath);
					}

					transformConfig = {
						...configurationProperties.transformConfigLessApiModel,
						apiModel,
					};

					renderConfig = configurationProperties.renderConfig;
				});

				// Run a sanity check to ensure that the suite did not generate multiple documents with the same
				// output file path. This either indicates a bug in the system, or an bad configuration.
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
						Path.join(modelName, configurationProperties.configName),
						transformConfig,
						renderConfig,
					);
				});
			});
		}
	});
}

describe("HTML rendering end-to-end tests", () => {
	const configs: ConfigurationTestProperties[] = [
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
				minimumReleaseLevel: ReleaseTag.Beta, // Only include `@public` and `beta` items in the docs suite
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
				minimumReleaseLevel: ReleaseTag.Public, // Only include `@public` items in the docs suite
			},
			renderConfig: {
				startingHeadingLevel: 2,
			},
		},
	];

	before(async () => {
		// Ensure the output temp and snapshots directories exists (will create an empty ones if they don't).
		await FileSystem.ensureFolderAsync(testTemporaryDirectoryPath);
		await FileSystem.ensureFolderAsync(snapshotsDirectoryPath);

		// Clear test temp dir before test run to make sure we are running from a clean state.
		await FileSystem.ensureEmptyFolderAsync(testTemporaryDirectoryPath);
	});

	// Run the test suite against a sample report
	apiTestSuite("simple-suite-test", testModelPaths, configs);
});
