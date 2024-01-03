/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This download script is used in docs/package.json to download the api json docs from the azure storage.
 * This script accepts an optional boolean parameter which controls if all versions or only the latest version
 * of the doc models get downloaded (pass in true for all versions).
 * e.g. "node ./download-apis.js true"
 */

const chalk = require("chalk");
const download = require("download");
const fs = require("fs-extra");
const path = require("path");
const versions = require("./data/versions.json");

const renderMultiVersion = process.argv[2];

const docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

Promise.all(
	docVersions.map(async (version) => {
		// We don't add a version-postfix directory name for "current" version, since local website builds want to use
		// the locally generated API doc models when present.
		const versionPostfix = version === versions.params.currentVersion ? "" : `-${version}`;
		const url = `https://fluidframework.blob.core.windows.net/api-extractor-json/latest${versionPostfix}.tar.gz`;
		const destination = path.resolve(
			__dirname,
			"..",
			`_api-extractor-temp${versionPostfix}`,
			"doc-models",
		);

		// Delete any existing contents in the directory before downloading artifact
		await fs.ensureDir(destination);
		await fs.emptyDir(destination);

		// Download the artifacts
		return download(url, destination, { extract: true });
	}),
).then(
	() => {
		console.log(chalk.green("API doc model artifacts downloaded!"));
		process.exit(0);
	},
	(error) => {
		console.error(
			chalk.red("Could not download API doc model artifacts due to one or more errors:"),
		);
		console.error(error);
		process.exit(1);
	},
);
