/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Our public API is exposed by re-exporting things from 'internal' packages in 'external' packages, like
 * fluid-framework. API Extractor does not extract re-exported APIs, so this script manipulates the API Extractor JSON
 * output to merge and re-write the API JSON as a workaround.
 *
 * To update the packages combined and how they are combined, edit the rollup-api-data.js file.
 *
 * This script changes source files in place; you may want to create a copy of the source files prior to running this
 * script on them. If you're using the tasks defined in package.json, then you don't need to do this; those scripts
 * create copies.
 */

const cpy = require("cpy");
const fs = require("fs-extra");

/**
 * This purpose of this method is to transfer the api json content from originalPath to targetPath.
 * Currently, the paths are configured such that originalPath is the _api-extractor-temp-{version}-doc-models
 * directory in the root of the repo (where the content either downloaded or generated with api-extractor).
 * targetPath is currently configured to be docs/_api-extractor-temp/{version}
 */
const main = async (originalPath, targetPath) => {
	// Clear output folders.
	await fs.emptyDir(targetPath);

	// Copy files from originalPath to targetPath
	console.log(`Copying final files from ${originalPath} to ${targetPath}`);
	await cpy(originalPath, targetPath).on("progress", (progress) => {
		if (progress.percent === 1) {
			console.log(`\tCopied ${progress.totalFiles} files.`);
		}
	});
};

module.exports = {
	main,
};
