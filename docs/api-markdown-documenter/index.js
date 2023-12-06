/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const yaml = require('js-yaml');
const fs   = require('fs');
const { renderApiDocumentation } = require("./render-api-documentation");

const renderMultiVersion = process.argv[2];

let docVersions;
try {
	const versions = yaml.load(fs.readFileSync('../tools/pipelines/templates/include-doc-versions.yml', 'utf8'));
	docVersions = renderMultiVersion ? versions.variables.previousVersions : versions.variables.currentVersion;
	docVersions = docVersions.split(",");
  } catch (e) {
	console.log(e);
}

docVersions.forEach(version => {
	version = (version === 'main') ? "" : "-" + version;

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