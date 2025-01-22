/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { HtmlRenderer, loadModel } from "@fluid-tools/api-markdown-documenter";

const modelDirectoryPath = "<PATH-TO-YOUR-DIRECTORY-CONTAINING-API-REPORTS>";
const outputDirectoryPath = "<YOUR-OUTPUT-DIRECTORY-PATH>";

// Create the API Model from our API reports
const apiModel = await loadModel({
	modelDirectoryPath,
});

await HtmlRenderer.renderApiModel({
	apiModel,
	uriRoot: "",
	outputDirectoryPath,
});
