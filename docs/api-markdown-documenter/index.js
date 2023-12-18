/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This index script runs the renderApiDocumentation script using the version configurations described
 * in data/versions.json. This script allows for an optional boolean parameter which determines whether
 * renderApiDocumentation will be ran for all versions or only previous versions. (pass in true for all versions)
 * e.g. "node ./api-markdown-documenter/index.js true"
 */

const chalk = require("chalk");
const versions = require("../data/versions.json");
const { renderApiDocumentation } = require("./render-api-documentation");
const path = require("path");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

const apiDocRenders = [];

docVersions.forEach((version) => {
	const apiReportsDirectoryPath = path.resolve(__dirname, "..", "_api-extractor-temp", version);

	// TODO: remove check for 2.0 and just set apiDocsDirectoryPath to include version.
	// currently publishing to base apis directory until 2.0 release
	const apiDocsDirectoryPath = renderMultiVersion
		? path.resolve(__dirname, "..", "content", "docs", "apis", version)
		: path.resolve(__dirname, "..", "content", "docs", "apis");

	// TODO: remove check for 2.0 and just set uriDirectoryPath to include version.
	// currently publishing to base apis directory until 2.0 release
	const uriRootDirectoryPath = renderMultiVersion ? `/docs/apis/${version}` : `/docs/apis`;

	apiDocRenders.push(
		renderApiDocumentation(
			apiReportsDirectoryPath,
			apiDocsDirectoryPath,
			uriRootDirectoryPath,
		).then(
			() => {
				console.log(chalk.green(`${version} API docs written!`));
			},
			(error) => {
				throw new Error(
					`${version} API docs could not be written due to an error: ${error}`,
				);
			},
		),
	);
});

Promise.all(apiDocRenders).then(
	() => {
		console.log(chalk.green("All API docs written!"));
		process.exit(0);
	},
	(error) => {
		console.error(error);
		process.exit(1);
	},
);
