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

import {
	MarkdownDocumenterConfiguration,
	markdownDocumenterConfigurationWithDefaults,
} from "../Configuration";
import { renderApiModelAsMarkdown, transformApiModel } from "../MarkdownDocumenter";
import { apiModelToDocument, apiPackageToDocument } from "../api-item-transforms";
import { DocumentNode } from "../documentation-domain";

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTempDirPath = Path.resolve(__dirname, "test_temp");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to dist/test.
 */
const snapshotsDirPath = Path.resolve(__dirname, "..", "..", "src", "test", "snapshots");

/**
 * Simple integration test that validates complete output from simple test package.
 *
 * @param relativeSnapshotDirectoryPath - Path to the test output (relative to the test directory).
 * Used when outputting raw contents, and when copying those contents to update generate / update snapshots.
 * @param config - See {@link MarkdownDocumenterConfiguration}.
 */
async function snapshotTest(
	relativeSnapshotDirectoryPath: string,
	config: MarkdownDocumenterConfiguration,
): Promise<void> {
	const outputDirPath = Path.resolve(testTempDirPath, relativeSnapshotDirectoryPath);
	const snapshotDirPath = Path.resolve(snapshotsDirPath, relativeSnapshotDirectoryPath);

	// Ensure the output temp and snapshots directories exists (will create an empty ones if they don't).
	await FileSystem.ensureFolderAsync(outputDirPath);
	await FileSystem.ensureFolderAsync(snapshotDirPath);

	// Clear any existing test_temp data
	await FileSystem.ensureEmptyFolderAsync(outputDirPath);

	await renderApiModelAsMarkdown(config, outputDirPath);

	// Verify against expected contents
	const result = await compare(outputDirPath, snapshotDirPath, {
		compareContent: true,
	});

	if (!result.same) {
		await FileSystem.ensureEmptyFolderAsync(snapshotDirPath);
		await FileSystem.copyFilesAsync({
			sourcePath: outputDirPath,
			destinationPath: snapshotDirPath,
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
	 * The config to use, except the `apiModel`, which will be instantiated in test set-up.
	 */
	configLessApiModel: Omit<MarkdownDocumenterConfiguration, "apiModel">;
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
				 * Complete config generated in `before` hook.
				 */
				let markdownDocumenterConfig: Required<MarkdownDocumenterConfiguration>;

				before(async () => {
					const apiModel = new ApiModel();
					for (const apiReportFilePath of apiReportFilePaths) {
						apiModel.loadPackage(apiReportFilePath);
					}

					markdownDocumenterConfig = markdownDocumenterConfigurationWithDefaults({
						...configProps.configLessApiModel,
						apiModel,
					});
				});

				it("Render Model document (smoke test)", () => {
					const result = apiModelToDocument(
						markdownDocumenterConfig.apiModel,
						markdownDocumenterConfig,
					);
					expect(result.filePath).to.equal("index.md");
				});

				it("Render Package document (smoke test)", () => {
					const packageItem = markdownDocumenterConfig.apiModel.packages[0];

					const result = apiPackageToDocument(packageItem, markdownDocumenterConfig);
					expect(result.filePath).to.equal(`${modelName}.md`);
				});

				it("Ensure no duplicate file paths", () => {
					const documents = transformApiModel(markdownDocumenterConfig);

					const pathMap = new Map<string, DocumentNode>();
					for (const document of documents) {
						if (pathMap.has(document.filePath)) {
							expect.fail(
								`Rendering generated multiple documents to be rendered to the same file path.`,
							);
						} else {
							pathMap.set(document.filePath, document);
						}
					}
				});

				it("Snapshot test", async () => {
					await snapshotTest(
						Path.join(modelName, configProps.configName),
						markdownDocumenterConfig,
					);
				});
			});
		}
	});
}

describe("api-markdown-documenter full-suite tests", () => {
	/**
	 * Sample "default" configuration.
	 */
	const defaultConfig: Omit<MarkdownDocumenterConfiguration, "apiModel"> = {
		uriRoot: ".",
		newlineKind: NewlineKind.Lf,
	};

	/**
	 * A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	 */
	const flatConfig: Omit<MarkdownDocumenterConfiguration, "apiModel"> = {
		uriRoot: "docs",
		newlineKind: NewlineKind.Lf,
		includeBreadcrumb: true,
		includeTopLevelDocumentHeading: false,
		documentBoundaries: [], // Render everything to package documents
		hierarchyBoundaries: [], // No additional hierarchy beyond the package level
		frontMatterPolicy: (documentItem): string =>
			`<!--- This is sample front-matter for API item "${documentItem.displayName}" -->`,
	};

	/**
	 * A sample "sparse" configuration, which renders every item kind to its own document.
	 */
	const sparseConfig: Omit<MarkdownDocumenterConfiguration, "apiModel"> = {
		uriRoot: "docs",
		newlineKind: NewlineKind.Lf,
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
	};

	const configs: ConfigTestProps[] = [
		{
			configName: "default-config",
			configLessApiModel: defaultConfig,
		},
		{
			configName: "flat-config",
			configLessApiModel: flatConfig,
		},
		{
			configName: "sparse-config",
			configLessApiModel: sparseConfig,
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
	apiTestSuite(
		"simple-suite-test",
		// Relative to dist/test
		[Path.resolve(__dirname, "test-data", "simple-suite-test.json")],
		configs,
	);
});
