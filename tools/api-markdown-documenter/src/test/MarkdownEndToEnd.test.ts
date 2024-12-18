/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Path from "node:path";
import { fileURLToPath } from "node:url";

import { ReleaseTag } from "@microsoft/api-extractor-model";
import { FileSystem, NewlineKind } from "@rushstack/node-core-library";

import { type DocumentNode, MarkdownRenderer } from "../index.js";

import {
	endToEndTests,
	HierarchyConfigs,
	type ApiModelTestOptions,
	type EndToEndTestConfig,
} from "./EndToEndTests.js";

const dirname = Path.dirname(fileURLToPath(import.meta.url));

/**
 * Temp directory under which all tests that generate files will output their contents.
 */
const testTemporaryDirectoryPath = Path.resolve(dirname, "test_temp", "markdown");

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
	"markdown",
);

// Relative to lib/test
const testDataDirectoryPath = Path.resolve(dirname, "..", "..", "src", "test", "test-data");

const apiModels: ApiModelTestOptions[] = [
	{
		modelName: "simple-suite-test",
		directoryPath: Path.resolve(testDataDirectoryPath, "simple-suite-test"),
	},
	// TODO: add other models
];

const testConfigs: EndToEndTestConfig<MarkdownRenderer.RenderDocumentsOptions>[] = [
	/**
	 * A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	 */
	{
		testName: "default-config",
		renderConfig: {
			uriRoot: ".",
		},
	},

	/**
	 * A sample "flat" configuration, which renders every item kind under a package to the package parent document.
	 */
	{
		testName: "flat-config",
		renderConfig: {
			uriRoot: "docs",
			includeBreadcrumb: true,
			includeTopLevelDocumentHeading: false,
			hierarchy: HierarchyConfigs.sparse,
			minimumReleaseLevel: ReleaseTag.Beta, // Only include `@public` and `beta` items in the docs suite
		},
	},

	/**
	 * A sample "sparse" configuration, which renders every item kind to its own document.
	 */
	{
		testName: "sparse-config",
		renderConfig: {
			uriRoot: "docs",
			includeBreadcrumb: false,
			includeTopLevelDocumentHeading: true,
			hierarchy: HierarchyConfigs.sparse,
			minimumReleaseLevel: ReleaseTag.Public, // Only include `@public` items in the docs suite
			skipPackage: (apiPackage) => apiPackage.name === "test-suite-b", // Skip test-suite-b package
			startingHeadingLevel: 2,
		},
	},
];

async function renderDocumentToFile(
	document: DocumentNode,
	renderConfig: MarkdownRenderer.RenderDocumentsOptions,
): Promise<void> {
	const renderedDocument = MarkdownRenderer.renderDocument(document, renderConfig);

	const filePath = Path.join(renderConfig.outputDirectoryPath, `${document.documentPath}.md`);
	await FileSystem.writeFileAsync(filePath, renderedDocument, {
		convertLineEndings: NewlineKind.Lf,
		ensureFolderExists: true,
	});
}

endToEndTests<MarkdownRenderer.RenderDocumentsOptions>({
	suiteName: "Markdown End-to-End Tests",
	temporaryOutputDirectoryPath: testTemporaryDirectoryPath,
	snapshotsDirectoryPath,
	render: renderDocumentToFile,
	apiModels,
	testConfigs,
});
