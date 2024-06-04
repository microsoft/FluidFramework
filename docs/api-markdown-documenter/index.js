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
import { renderApiDocumentation } from "./render-api-documentation.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const {
	params: { currentVersion, previousVersions },
} = await fs.readJSON(path.resolve(dirname, "..", "data", "versions.json"));

const docVersions = previousVersions.concat(currentVersion);

try {
	await Promise.all(
		docVersions.map(async (version) => {
			const apiReportsDirectoryPath = path.resolve(dirname, "..", "_doc-models", version);
			const apiDocsDirectoryPath = path.resolve(
				dirname,
				"..",
				"content",
				"docs",
				"api",
				version,
			);

			// Note: the leading slash in the URI root is important.
			// It tells Hugo to interpret the links as relative to the site root, rather than
			// relative to the document containing the link.
			// See documentation here: https://gohugo.io/content-management/urls/#relative-urls
			const uriRootDirectoryPath = `/docs/api/${version}`;

			await renderApiDocumentation(
				apiReportsDirectoryPath,
				apiDocsDirectoryPath,
				uriRootDirectoryPath,
				version,
			);

			console.log(chalk.green(`(${version}) API docs written!`));
		}),
	);
} catch (error) {
	console.error(chalk.red("API docs generation failed due to one or more errors:"));
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("All API docs written!"));
process.exit(0);
