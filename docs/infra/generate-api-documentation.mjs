/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This index script runs `render-api-documentation.js` using the version configurations described
 * in data/versions.json.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import fs from "fs-extra";

import { renderApiDocumentation } from "./api-markdown-documenter/index.mjs";

const devMode = process.env.NODE_ENV === "development";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const versions = ["1", "2"];

const downloadedDocModelsDirectoryPath = path.resolve(dirname, "..", ".doc-models");

const docModelDirectoryPaths = {
	"1": path.resolve(downloadedDocModelsDirectoryPath, "v1"),
	"2": path.resolve(downloadedDocModelsDirectoryPath, "v2"),
};

const outputDirectories = {
	"1": path.resolve(dirname, "..", "versioned_docs", "version-1", "api"),
	"2": path.resolve(dirname, "..", "docs", "api"),
};

if (devMode) {
	const localDocModelPath = path.resolve(dirname, "..", "..", "_api-extractor-temp", "doc-models");
	await fs.readdir(localDocModelPath);
}

try {
	await Promise.all(versions.map(async (version) => {
		const docModelDirectoryPath = docModelDirectoryPaths[version];
		const apiDocsDirectoryPath = outputDirectories[version];

		// Note: the leading slash in the URI root is important.
		// It tells Docusaurus to interpret the links as relative to the site root, rather than
		// relative to the document containing the link.
		// See documentation here: https://docusaurus.io/docs/markdown-features/links
		const uriRootDirectoryPath = `/docs/api`;

		await renderApiDocumentation(
			docModelDirectoryPath,
			apiDocsDirectoryPath,
			uriRootDirectoryPath,
			version,
		);

		console.log(chalk.green(`Version "${version}" API docs written!`));
	}));
} catch (error) {
	console.error(chalk.red("API docs generation failed due to one or more errors:"));
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("All API docs written!"));
process.exit(0);
