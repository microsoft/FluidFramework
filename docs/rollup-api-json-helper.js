/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This helper function is used to optionally run rollup-api-json.js multiple times based on the
 * versions described in versions.json. In docs/package.json, "build:api-rollup:multi-version" and 
 * "build:api-rollup" calls this script. Note that this script allows for an optional boolean parameter
 * to be passed in the script call. 
 * e.g. "node ./rollup-api-json-helper.js true"
 * This boolean parameter determines if the rollup will be executed on all versions or only the
 * latest version (pass in true for all versions).
 */

const chalk = require("chalk");
const path = require("path");
const versions = require("./data/versions.json");
const { main } = require("./rollup-api-json");
const { rimraf } = require("rimraf");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

docVersions.forEach((version) => {
	const targetPath = path.resolve(".", "_api-extractor-temp", version);
	// change to empty string since current build:docs doesn't append version number to _api-extractor-temp
	version = version === versions.params.currentVersion ? "" : "-" + version;
	const originalPath = path.resolve("..", "_api-extractor-temp" + version, "doc-models");

	rimraf(targetPath);

	main(originalPath, targetPath).then(
		() => {
			console.log(chalk.green("SUCCESS: API log files staged!"));
			process.exit(0);
		},
		(error) => {
			console.error("FAILURE: API log files could not be staged due to an error.", error);
			process.exit(1);
		},
	);
});
