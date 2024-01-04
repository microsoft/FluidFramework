/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	ApiItemKind,
	ApiItemUtilities,
	DocumentationNodeType,
	getApiItemTransformationConfigurationWithDefaults,
	loadModel,
	MarkdownRenderer,
	transformApiModel,
} = require("@fluid-tools/api-markdown-documenter");
const { PackageName } = require("@rushstack/node-core-library");
const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");

const { alertNodeType } = require("./alert-node");
const { layoutContent } = require("./api-documentation-layout");
const { buildNavBar } = require("./build-api-nav");
const { renderAlertNode, renderBlockQuoteNode, renderTableNode } = require("./custom-renderers");
const { createHugoFrontMatter } = require("./front-matter");

/**
 * Generates a documentation suite for the API model saved under `inputDir`, saving the output to `outputDir`.
 * @param {string} inputDir - The directory path containing the API model to be processed.
 * @param {string} outputDir - The directory path under which the generated documentation suite will be saved.
 * @param {string} uriRootDir - The base for all links between API members.
 * @param {string} apiVersionNum - The API model version string used to differentiate different major versions of the
 * framework for which API documentation is presented on the website.
 */
async function renderApiDocumentation(inputDir, outputDir, uriRootDir, apiVersionNum) {
	/**
	 * Logs a progress message, prefaced with the API version number to help differentiate parallel logging output.
	 */
	function logProgress(message) {
		console.log(`(${apiVersionNum}) ${message}`);
	}

	/**
	 * Logs the error with the specified message, prefaced with the API version number to help differentiate parallel
	 * logging output, and re-throws the error.
	 */
	function logErrorAndRethrow(message, error) {
		console.error(chalk.red(`(${apiVersionNum}) ${message}:`));
		console.error(error);
		throw error;
	}

	// Delete existing documentation output
	logProgress("Removing existing generated API docs...");
	await fs.ensureDir(outputDir);
	await fs.emptyDir(outputDir);

	// Process API reports
	logProgress("Loading API model...");

	const apiModel = await loadModel(inputDir);

	// Custom renderers that utilize Hugo syntax for certain kinds of documentation elements.
	const customRenderers = {
		[DocumentationNodeType.BlockQuote]: renderBlockQuoteNode,
		[DocumentationNodeType.Table]: renderTableNode,
		[alertNodeType]: renderAlertNode,
	};

	const config = getApiItemTransformationConfigurationWithDefaults({
		apiModel,
		documentBoundaries: [
			ApiItemKind.Class,
			ApiItemKind.Enum,
			ApiItemKind.Interface,
			ApiItemKind.Namespace,
		],
		newlineKind: "lf",
		uriRoot: uriRootDir,
		includeBreadcrumb: false, // Hugo will now be used to generate the breadcrumb
		includeTopLevelDocumentHeading: false, // This will be added automatically by Hugo
		createDefaultLayout: layoutContent,
		skipPackage: (apiPackage) => {
			// Skip `@fluid-internal` and `@fluid-private` packages
			const packageName = apiPackage.displayName;
			const packageScope = PackageName.getScope(packageName);

			return ["@fluid-internal", "@fluid-private"].includes(packageScope);
		},
		getFileNameForItem: (apiItem) => {
			switch (apiItem.kind) {
				case ApiItemKind.Model: {
					return "ref"; // TODO
				}
				case ApiItemKind.Package: {
					return ApiItemUtilities.getUnscopedPackageName(apiItem);
				}
				default: {
					return ApiItemUtilities.getQualifiedApiItemName(apiItem);
				}
			}
		},
		frontMatter: (apiItem) =>
			createHugoFrontMatter(apiItem, config, customRenderers, apiVersionNum),
		// TODO: enable the following once we have finished gettings the repo's release tags sorted out for 2.0.
		// minimumReleaseLevel: ReleaseTag.Beta, // Don't include `@alpha` or `@internal` items in docs published to the public website.
	});

	logProgress("Generating API documentation...");

	let documents;
	try {
		documents = transformApiModel(config);
	} catch (error) {
		logErrorAndRethrow("Encountered error while processing API model", error);
	}

	logProgress("Generating nav bar contents...");

	try {
		await buildNavBar(documents, apiVersionNum);
	} catch (error) {
		logErrorAndRethrow("Encountered an error while saving nav bar yaml files", error);
	}

	logProgress("Writing API documents to disk...");

	await Promise.all(
		documents.map(async (document) => {
			let fileContents;
			try {
				fileContents = MarkdownRenderer.renderDocument(document, {
					startingHeadingLevel: 2, // Hugo will inject its document titles as 1st level headings, so start content heading levels at 2.
					customRenderers,
				});
			} catch (error) {
				logErrorAndRethrow(
					`Encountered error while rendering Markdown contents for "${document.apiItem.displayName}"`,
					error,
				);
			}

			let filePath = path.join(outputDir, `${document.documentPath}.md`);

			try {
				// Hugo uses a special file-naming syntax to represent documents with "child" documents in the same directory.
				// Namely, "_index.md". However, the resulting html names these modules "index", rather than
				// "_index", so we cannot use the "_index" convention when generating the docs and the links between them.
				// To accommodate this, we will match on "index.md" files and adjust the file name accordingly.
				if (filePath.endsWith("index.md")) {
					filePath = filePath.replace("index.md", "_index.md");
				}

				await fs.ensureFile(filePath);
				await fs.writeFile(filePath, fileContents);
			} catch (error) {
				logErrorAndRethrow(
					`Encountered error while writing file output for "${document.apiItem.displayName}"`,
					error,
				);
			}
		}),
	);
}

module.exports = {
	renderApiDocumentation,
};
