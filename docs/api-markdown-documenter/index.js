/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This index script runs `render-api-documentation.js` using the version configurations described
 * in data/versions.json.
 * 
 * This script accepts a boolean parameter which is saved to the isLocal constant. Passing in true
 * will configure the script to render docs for local api content instead of the docs versions
 * specified in versions.json.
 */

const chalk = require("chalk");
const path = require("path");
const versions = require("../data/versions.json");
const { renderApiDocumentation } = require("./render-api-documentation");

const isLocal = process.argv[2];
const docVersions = isLocal ? ["local"] : versions.params.previousVersions.concat(versions.params.currentVersion);

Promise.all(
	docVersions.map(async (version) => {
		const apiReportsDirectoryPath = path.resolve(__dirname, "..", "_doc-models", version);

		const apiDocsDirectoryPath = path.resolve(
			__dirname,
			"..",
			"content",
			"docs",
			"api",
			version,
		);

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
