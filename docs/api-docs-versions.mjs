/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * "Configuration" for API docs versions to be included in the build.
 */

const downloadedDocModelsDirectoryPath = path.resolve(dirname, ".doc-models");
const currentDocsPath = path.resolve(dirname, "docs");
const versionedDocsPath = path.resolve(dirname, "versioned_docs");

// Note: the leading slash in the `uriRoot` is important.
// It tells Docusaurus to interpret the links as relative to the site root,
// rather than relative to the document containing the link.
// See documentation here: https://docusaurus.io/docs/markdown-features/links

// TODO: use this in docusaurus config
const config = {
	1: {
		inputPath: path.resolve(downloadedDocModelsDirectoryPath, "v1"),
		outputPath: path.resolve(versionedDocsPath, "version-1", "api"),
		uriRoot: "/docs/v1/api",
	},
	2: {
		inputPath: path.resolve(downloadedDocModelsDirectoryPath, "v2"),
		outputPath: path.resolve(currentDocsPath, "api"),
		uriRoot: "/docs/api",
		current: true,
	}
};

if (process.env.NODE_ENV === "development") {
	config["local-api"] = {
		inputPath: path.resolve(dirname, "..", "_api-extractor-temp", "doc-models"),
		outputPath: path.resolve(versionedDocsPath, "version-local-api", "api"),
		uriRoot: "/docs/local-api/api",
		local: true,
	}
}

export default config;
