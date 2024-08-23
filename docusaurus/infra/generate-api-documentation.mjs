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
import { renderApiDocumentation } from "./api-markdown-documenter/index.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

try {
	const apiReportsDirectoryPath = path.resolve(dirname, "..", ".doc-models", "v2");
	const apiDocsDirectoryPath = path.resolve(
		dirname,
		"..",
		"docs",
		"api",
		// version,
	);

	// Note: the leading slash in the URI root is important.
	// It tells Docusaurus to interpret the links as relative to the site root, rather than
	// relative to the document containing the link.
	// See documentation here: https://docusaurus.io/docs/markdown-features/links
	const uriRootDirectoryPath = `/docs/api`;

	await renderApiDocumentation(
		apiReportsDirectoryPath,
		apiDocsDirectoryPath,
		uriRootDirectoryPath,
	);

	console.log(chalk.green(`API docs written!`));
} catch (error) {
	console.error(chalk.red("API docs generation failed due to one or more errors:"));
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("All API docs written!"));
process.exit(0);
