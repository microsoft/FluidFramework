/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This index script runs `render-api-documentation.js` using the version configurations described
 * in data/versions.json.
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import { renderApiDocumentation } from "./render-api-documentation.js";

const versions = require("../data/versions.json");

const dirname = path.dirname(fileURLToPath(import.meta.url));

const docVersions = versions.params.previousVersions.concat(versions.params.currentVersion);

Promise.all(
	docVersions.map(async (version) => {
		const apiReportsDirectoryPath = path.resolve(dirname, "..", "_doc-models", version);
		const apiDocsDirectoryPath = path.resolve(dirname, "..", "content", "docs", "api", version);

		// Note: the leading slash in the URI root is important.
		// It tells Hugo to enterpret the links as relative to the site root, rather than
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
).then(
	() => {
		console.log(chalk.green("All API docs written!"));
		process.exit(0);
	},
	(error) => {
		console.error(chalk.red("API docs generation failed due to one or more errors:"));
		console.error(error);
		process.exit(1);
	},
);
