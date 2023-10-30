/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	DocumentationNodeType,
	getApiItemTransformationConfigurationWithDefaults,
	loadModel,
	renderDocumentAsMarkdown,
	transformApiModel,
} = require("@fluid-tools/api-markdown-documenter");
const { ApiItemKind } = require("@microsoft/api-extractor-model");
const { PackageName } = require("@rushstack/node-core-library");
const fs = require("fs-extra");
const path = require("path");
const yaml = require("js-yaml");

const { alertNodeType } = require("./alert-node");
const { layoutContent } = require("./api-documentation-layout");
const { renderAlertNode, renderBlockQuoteNode, renderTableNode } = require("./custom-renderers");
const { createHugoFrontMatter } = require("./front-matter");

const apiReportsDirectoryPath = path.resolve(__dirname, "..", "_api-extractor-temp", "_build");
const apiDocsDirectoryPath = path.resolve(__dirname, "..", "content", "docs", "apis");

async function renderApiDocumentation() {
	// Delete existing documentation output
	console.log("Removing existing generated API docs...");
	await fs.ensureDir(apiDocsDirectoryPath);
	await fs.emptyDir(apiDocsDirectoryPath);

	// Process API reports
	console.group();

	const apiModel = await loadModel(apiReportsDirectoryPath);

	// Custom renderers that utilize Hugo syntax for certain kinds of documentation elements.
	const customRenderers = {
		[DocumentationNodeType.BlockQuote]: renderBlockQuoteNode,
		[DocumentationNodeType.Table]: renderTableNode,
		[alertNodeType]: renderAlertNode,
	};

	console.groupEnd();

	const config = getApiItemTransformationConfigurationWithDefaults({
		documentBoundaries: [
			ApiItemKind.Class,
			ApiItemKind.Enum,
			ApiItemKind.Interface,
			ApiItemKind.Namespace,
		],
		apiModel,
		newlineKind: "lf",
		uriRoot: "/docs/apis",
		includeTopLevelDocumentHeading: false, // This will be added automatically by Hugo
		createDefaultLayout: layoutContent,
		packageFilterPolicy: (apiPackage) => {
			// Skip `@fluid-internal` packages
			const packageName = apiPackage.displayName;
			const packageScope = PackageName.getScope(packageName);

			console.log(`${packageName}: ${packageScope}`);

			return ["@fluid-internal"].includes(packageScope);
		},
		fileNamePolicy: (apiItem) => {
			return apiItem.kind === ApiItemKind.Model
				? "index"
				: DefaultPolicies.defaultFileNamePolicy(apiItem);
		},
		frontMatter: (apiItem) => createHugoFrontMatter(apiItem, config, customRenderers),
	});

	console.log("Generating API documentation...");
	console.group();

	let documents;
	try {
		documents = transformApiModel(config);
	} catch (error) {
		console.error("Encountered error while generating API documentation:", error);
		throw error;
	}

	processMetaDataFromDocuments(documents);

	console.groupEnd();

	console.log("Writing API documents to disk...");
	console.group();

	await Promise.all(
		documents.map(async (document) => {
			let fileContents;
			try {
				fileContents = renderDocumentAsMarkdown(document, {
					startingHeadingLevel: 2, // Hugo will inject its document titles as 1st level headings, so start content heading levels at 2.
					customRenderers,
				});
			} catch (error) {
				console.error("Encountered error while rendering Markdown:", error);
				throw error;
			}

			let filePath = path.join(apiDocsDirectoryPath, `${document.documentPath}.md`);

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

	console.groupEnd();
}

/**
 * Processes, categorizes them based on API item kinds and saves metadata from documents into YAML files.
 *
 * The function creates maps from the metadata: one for API items and another for packages.
 * Results are saved to 'apiData.yaml' and 'packageData.yaml' in the 'data' directory.
 *
 * @param {Array<Object>} documents - List of documents containing metadata.
 * @param {Object} documents[].documentItemMetadata - Metadata for a document item.
 * @param {string} documents[].documentItemMetadata.apiItemName - Name of the API item.
 * @param {string} documents[].documentItemMetadata.apiItemKind - Kind of the API item (e.g., Class, Interface, Package).
 * @param {string} documents[].documentItemMetadata.packageName - Name of the package to which the API item belongs.
 *
 * @returns {void}
 */
function processMetaDataFromDocuments(documents) {
	const { APIMap, packageMap } = documents.reduce(
		(
			{ APIMap, packageMap },
			{ documentItemMetadata: { apiItemName, apiItemKind, packageName } },
		) => {
			if (apiItemKind === ApiItemKind.Package) {
				return {
					APIMap,
					packageMap: { ...packageMap, [apiItemName]: packageName },
				};
			}

			if (
				[ApiItemKind.Class, ApiItemKind.Interface, ApiItemKind.Enum].includes(apiItemKind)
			) {
				APIMap[packageName] = APIMap[packageName] || {};
				APIMap[packageName][apiItemKind] = APIMap[packageName][apiItemKind] || [];
				APIMap[packageName][apiItemKind].push(apiItemName);
			}
			return { APIMap, packageMap };
		},
		{ APIMap: {}, packageMap: {} },
	);

	fs.writeFileSync(path.join(__dirname, "..", "data", "apiData.yaml"), yaml.dump(APIMap), "utf8");
	fs.writeFileSync(
		path.join(__dirname, "..", "data", "packageData.yaml"),
		yaml.dump(packageMap),
		"utf8",
	);
}

module.exports = {
	renderApiDocumentation,
};
