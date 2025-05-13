/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { MarkdownRenderer, loadModel } from "@fluid-tools/api-markdown-documenter";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const inputDir = path.resolve(dirname, "_api-extractor-temp", "doc-models");
const outputDir = path.resolve(dirname, "docs");

console.debug(dirname, inputDir, outputDir);

// Create the API Model from our API reports
const apiModel = await loadModel(inputDir);

const config = {
	apiModel,
	uriRoot: ".",
};

await MarkdownRenderer.renderApiModel(config, outputDir);
