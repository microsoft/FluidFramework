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

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

const apiDocRenders = [];

docVersions.forEach((version) => {
	apiDocRenders.push(
		renderApiDocumentation(version).then(
			() => {
				console.log(chalk.green(`${version} API docs written!`));
			},
			(error) => {
				throw new error(`${version} API docs could not be written due to an error:`, error);
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

