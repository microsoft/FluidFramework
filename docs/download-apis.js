/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This download script is used in docs/package.json to download the api json docs from the azure storage.
 * This script accepts an optional boolean parameter which controls if all versions or only the latest version 
 * of the doc models get downloaded. (pass in true for all versions)
 * e.g. "node ./download-apis.js true"
 */

const chalk = require("chalk");
const download = require("download");
const versions = require("./data/versions.json");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

const downloadConfigs = [];

docVersions.forEach((version) => {
	version = version === versions.params.currentVersion ? "" : "-" + version;
	const url = `https://fluidframework.blob.core.windows.net/api-extractor-json/latest${version}.tar.gz`;
	const destination = `../_api-extractor-temp${version}/doc-models/`;

	downloadConfigs.push(download(url, destination, { extract: true }));
});

Promise.all(
	downloadConfigs
).then(
	() => {
		console.log(chalk.green("API doc models downloaded!"));
		process.exit(0);
	},
	(error) => {
		console.error(error);
		process.exit(1);
	},
);
