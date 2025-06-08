/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	loadModel,
	documentToHtml,
	transformApiModel,
} from "@fluid-tools/api-markdown-documenter";

const modelDirectoryPath = "<PATH-TO-YOUR-DIRECTORY-CONTAINING-API-REPORTS>";

// Create the API Model from our API reports
const apiModel = await loadModel({
	modelDirectoryPath,
});

// Transform the API Model to documents
const documents = transformApiModel({
	apiModel,
});

// Convert the documents to HTML via hast
const htmlDocuments = documents.map((document) => documentToHtml(document, {}));

// Use the resulting HTML documents with your favorite hast-compatible library!

// Allow otherwise unused variable above.
// This code is only compiled, not run.
console.log(htmlDocuments);
