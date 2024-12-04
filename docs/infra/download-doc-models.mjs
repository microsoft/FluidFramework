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
import { download } from "dill-cli";
import fs from "fs-extra";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const versions = ["1", "2"];

// TODO: automate the generation of these URLs and output directories
const artifactUrlBase = "https://storage.fluidframework.com/api-extractor-json/latest";
const artifacts = {
	1: `${artifactUrlBase}-v1.tar.gz`,
	2: `${artifactUrlBase}-v2.tar.gz`,
};

const docModelsDirectory = path.resolve(dirname, "..", ".doc-models");

const outputDirectories = {
	1: path.resolve(docModelsDirectory, "v1"),
	2: path.resolve(docModelsDirectory, "v2"),
};

try {
	await Promise.all(
		versions.map(async (version) => {
			const url = artifacts[version];
			const destination = outputDirectories[version];

			// Delete any existing contents in the directory before downloading artifact
			await fs.ensureDir(destination);
			await fs.emptyDir(destination);

			// Download the artifacts
			await download(url, { downloadDir: destination, extract: true });
		}),
	);
} catch (error) {
	console.error(
		chalk.red("Could not download API doc model artifacts due to one or more errors:"),
	);
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("API doc model artifacts downloaded!"));
process.exit(0);
