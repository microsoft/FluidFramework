/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const versions = require("../data/versions.json");
const { renderApiDocumentation } = require("./render-api-documentation");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.currentVersion.concat(versions.params.previousVersions)
	: versions.params.currentVersion;

docVersions.forEach((version) => {
	renderApiDocumentation(version).then(
		() => {
			console.log(chalk.green("API docs written!"));
			process.exit(0);
		},
		(error) => {
			console.error("API docs could not be written due to an error:", error);
			process.exit(1);
		},
	);
});
