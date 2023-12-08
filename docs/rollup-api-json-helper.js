/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");
const path = require("path");
const versions = require('./data/versions.json');
const { main } = require('./rollup-api-json');
const { rimraf } = require("rimraf");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion ? versions.params.previousVersions : versions.params.currentVersion;

docVersions.forEach(version => {
	const targetPath = path.resolve(".", "_api-extractor-temp", version);
	// change to empty string since current build:docs doesn't append version number to _api-extractor-temp
	version = (version === versions.params.currentVersion[0]) ? "" : "-" + version
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
