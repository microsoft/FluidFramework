/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	loadModel,
	transformApiModel,
	saveDocuments,
} from "@fluid-tools/api-markdown-documenter";
import { toHtml } from "hast-util-to-html";
import { toHast } from "mdast-util-to-hast";

const modelDirectoryPath = "<PATH-TO-YOUR-DIRECTORY-CONTAINING-API-REPORTS>";
const outputDirectoryPath = "<YOUR-OUTPUT-DIRECTORY-PATH>";

// Create the API Model from our API reports
const apiModel = await loadModel({
	modelDirectoryPath,
});

// Transform the API Model to Markdown AST documents
const markdownDocuments = await transformApiModel({
	apiModel,
});

// Convert the Markdown AST documents to HTML
const htmlDocuments = markdownDocuments.map((document) => {
	const hast = toHast(document.contents, {
		// Required for embedded HTML contents to be rendered correctly
		allowDangerousHtml: true,
	});
	const html = toHtml(hast, {
		// Required for embedded HTML contents to be rendered correctly
		allowDangerousHtml: true,
	});
	return {
		apiItem: document.apiItem,
		contents: html,
		filePath: `${document.documentPath}.html`, // Append .html extension
	};
});

// Write the HTML documents to the output directory
await saveDocuments(htmlDocuments, {
	outputDirectoryPath,
});
