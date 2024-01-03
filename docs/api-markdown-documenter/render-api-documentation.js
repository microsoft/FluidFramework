/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	ApiItemKind,
	DocumentationNodeType,
	getApiItemTransformationConfigurationWithDefaults,
	loadModel,
	MarkdownRenderer,
	transformApiModel,
} = require("@fluid-tools/api-markdown-documenter");
const { PackageName } = require("@rushstack/node-core-library");
const fs = require("fs-extra");
const path = require("path");

const { alertNodeType } = require("./alert-node");
const { layoutContent } = require("./api-documentation-layout");
const { buildNavBar } = require("./build-api-nav");
const { renderAlertNode, renderBlockQuoteNode, renderTableNode } = require("./custom-renderers");
const { createHugoFrontMatter } = require("./front-matter");

async function renderApiDocumentation(inputDir, outputDir, uriRootDir, apiVersionNum) {
	// Delete existing documentation output
	console.log("Removing existing generated API docs...");
	await fs.ensureDir(outputDir);
	await fs.emptyDir(outputDir);

	// Process API reports
	console.log("Loading API model...");

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
		frontMatter: (apiItem) => createHugoFrontMatter(apiItem, config, customRenderers),
		// TODO: enable the following once we have finished gettings the repo's release tags sorted out for 2.0.
		// minimumReleaseLevel: ReleaseTag.Beta, // Don't include `@alpha` or `@internal` items in docs published to the public website.
	});

	console.log("Generating API documentation...");

	let documents;
	try {
		documents = transformApiModel(config);
	} catch (error) {
		console.error("Encountered error while generating API documentation:", error);
		throw error;
	}

	console.log("Generating nav contents...");

	try {
		await buildNavBar(documents, apiVersionNum);
	} catch (error) {
		console.error("Error saving nav bar yaml files:", error);
		throw error;
	}

	console.log("Writing API documents to disk...");

	await Promise.all(
		documents.map(async (document) => {
			let fileContents;
			try {
				fileContents = MarkdownRenderer.renderDocument(document, {
					startingHeadingLevel: 2, // Hugo will inject its document titles as 1st level headings, so start content heading levels at 2.
					customRenderers,
				});
			} catch (error) {
				console.error("Encountered error while rendering Markdown:", error);
				throw error;
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
				console.error(
					`Encountered error while writing file output for "${document.apiItem.displayName}":`,
				);
				console.error(error);
				throw error;
			}
		}),
	);
}

module.exports = {
	renderApiDocumentation,
};
