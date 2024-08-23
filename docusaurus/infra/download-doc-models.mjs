/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This download script is used to download the api json docs from the azure storage.
 * Saves each model under `.doc-models/<version>`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import download from "download";
import fs from "fs-extra";

const dirname = path.dirname(fileURLToPath(import.meta.url));

try {
	const url = `https://fluidframework.blob.core.windows.net/api-extractor-json/latest.tar.gz`;

	const destination = path.resolve(dirname, "..", ".doc-models", "v2");

	// Delete any existing contents in the directory before downloading artifact
	await fs.ensureDir(destination);
	await fs.emptyDir(destination);

	// Download the artifacts
	await download(url, destination, { extract: true });
} catch (error) {
	console.error(
		chalk.red("Could not download API doc model artifacts due to one or more errors:"),
	);
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("API doc model artifacts downloaded!"));
process.exit(0);
