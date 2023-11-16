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
	ApiItemUtilities,
} = require("@fluid-tools/api-markdown-documenter");
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
		includeBreadcrumb: false,
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

	buildNavBar(documents);

	console.groupEnd();

	console.log("Writing API documents to disk...");
	console.group();

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
 * Processes documents and generates data required for the nav bar.
 * @param {Array<Object>} documents - List of documents with apiItem.
 * @param {ApiItem | undefined} documents.apiItem - The API item that the document is created from. Some documents may not have an apiItem.
 */
function buildNavBar(documents) {
	const validKinds = new Set([
		ApiItemKind.Class,
		ApiItemKind.Interface,
		ApiItemKind.Enum,
		ApiItemKind.Namespace,
	]);
	const { allAPIs, packageMap } = documents.reduce(
		({ allAPIs, packageMap }, { apiItem }) => {
			if (apiItem === undefined) {
				return { allAPIs, packageMap };
			}

			const { displayName, kind } = apiItem;

			const associatedPackage = apiItem.getAssociatedPackage();
			const packageName =
				associatedPackage === undefined
					? undefined
					: ApiItemUtilities.getUnscopedPackageName(associatedPackage);

			if (kind === ApiItemKind.Package) {
				packageMap[displayName] = packageName;
			} else if (validKinds.has(kind)) {
				allAPIs[packageName] = allAPIs[packageName] || {};
				allAPIs[packageName][kind] = allAPIs[packageName][kind] || [];
				allAPIs[packageName][kind].push(displayName);
			}

			return { allAPIs, packageMap };
		},
		{ allAPIs: {}, packageMap: {} },
	);

	saveToFile("allAPIs.yaml", allAPIs);
	saveToFile("packageNameToDisplayName.yaml", packageMap);
	saveToFile("displayNameToPackageName.yaml", invertMap(packageMap));
}

const saveToFile = (filename, data) =>
	fs.writeFileSync(path.join(__dirname, "..", "data", filename), yaml.dump(data), "utf8");

const invertMap = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));

module.exports = {
	renderApiDocumentation,
};
