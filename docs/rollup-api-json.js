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
const path = require("path");
const replace = require("replace-in-file");

/**
 * This purpose of this method is to transfer the api json content from originalPath to targetPath.
 * Currently, the paths are configured such that originalPath is the _api-extractor-temp-{version}-doc-models
 * directory in the root of the repo (where the content either downloaded or generated with api-extractor). 
 * targetPath is currently configured to be docs/_api-extractor-temp/{version}/(_build or _staging) 
 */
const main = async (originalPath, targetPath) => {
	const stagingPath = path.join(targetPath, "_staging");
	const outputPath = path.join(targetPath, "_build");

	// Clear output folders.
	await fs.emptyDir(stagingPath);
	await fs.emptyDir(outputPath);

	const apiExtractorInputDir = originalPath;

	// Copy all the files to staging that need to be present for member processing.
	await cpy(apiExtractorInputDir, stagingPath);

	// Rewrite any remaining references in the output files using replace-in-files
	const from = [];
	const to = [];

	try {
		const options = {
			files: `${path.resolve(stagingPath)}/**`,
			from: from,
			to: to,
		};

		await replace(options);
	} catch (error) {
		console.error("Error occurred:", error);
	}

	// Copy all processed files that should be published on the site to the output dir.
	console.log(`Copying final files from ${stagingPath} to ${outputPath}`);
	await cpy(stagingPath, outputPath).on("progress", (progress) => {
		if (progress.percent === 1) {
			console.log(`\tCopied ${progress.totalFiles} files.`);
		}
	});
};

module.exports = {
	main,
};
