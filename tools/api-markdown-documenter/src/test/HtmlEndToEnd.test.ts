/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { ApiItemKind, ReleaseTag } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { type Suite } from "mocha";

import { renderApiModelAsHtml } from "../RenderHtml.js";
import {
	type ApiItemTransformationConfiguration,
	transformApiModel,
} from "../api-item-transforms/index.js";
import { type DocumentNode } from "../documentation-domain/index.js";
import { type HtmlRenderConfiguration } from "../renderers/index.js";
import { compareDocumentationSuiteSnapshot } from "./SnapshotTestUtilities.js";
import { loadModel } from "../LoadModel.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTemporaryDirectoryPath = Path.resolve(dirname, "test_temp", "html");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to lib/test
 */
const snapshotsDirectoryPath = Path.resolve(
	dirname,
	"..",
	"..",
	"src",
	"test",
	"snapshots",
	"html",
);

// Relative to lib/test
const testDataDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");
const testModelDirectoryPath = Path.resolve(testDataDirectoryPath, "simple-suite-test");

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
 * @param apiModelDirectoryPath - Path to the directory serving as the API model.
 * @param configs - Configurations to test against.
 */
function apiTestSuite(
	modelName: string,
	apiModelDirectoryPath: string,
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
					const apiModel = await loadModel({ modelDirectoryPath: apiModelDirectoryPath });
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
	apiTestSuite("simple-suite-test", testModelDirectoryPath, configs);
});
