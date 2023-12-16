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
const cpy = require("cpy");
const fs = require("fs-extra");
const path = require("path");
const versions = require("./data/versions.json");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

async function stageMetadata(version) {
	const targetPath = path.resolve(".", "_api-extractor-temp", version);
	// change to empty string since current build:docs doesn't append version number to _api-extractor-temp
	version = version === versions.params.currentVersion ? "" : "-" + version;
	const originalPath = path.resolve("..", "_api-extractor-temp" + version, "doc-models");

	// Clear output folder
	await fs.emptyDir(targetPath);

	try {
		// Copy files from originalPath to targetPath
		console.log(`Copying final files from ${originalPath} to ${targetPath}`);
		await cpy(originalPath, targetPath).on("progress", (progress) => {
			if (progress.percent === 1) {
				console.log(`\tCopied ${progress.totalFiles} files.`);
			}
		});
	} catch (error) {
		throw new Error(
			`FAILURE: ${version} API metadata could not be staged due to an error: ${error}`,
		);
	}
	console.log(chalk.green(`SUCCESS: ${version} API metadata staged!`));
}

Promise.all(docVersions.map(stageMetadata)).then(
	() => {
		console.log(chalk.green("SUCCESS: All API metadata staged!"));
		process.exit(0);
	},
	(error) => {
		console.error("FAILURE: API metadata could not be staged due to an error.", error);
		process.exit(1);
	},
);
