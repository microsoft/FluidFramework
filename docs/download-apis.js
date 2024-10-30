/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This download script is used to download the api json docs from the azure storage.
 * Saves each model under `_doc-models/<version>`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import { download } from "dill-cli";
import fs from "fs-extra";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const {
	params: { currentVersion, previousVersions },
} = await fs.readJSON(path.resolve(dirname, "data", "versions.json"));
const docVersions = previousVersions.concat(currentVersion);

// remove local version from list to download, since there are no remote artifacts for it
docVersions.splice(docVersions.indexOf("local"), 1);

try {
	await Promise.all(
		docVersions.map(async (version) => {
			const versionPostfix = `-${version}`;

			const url = `https://storage.fluidframework.com/api-extractor-json/latest${versionPostfix}.tar.gz`;

			const destination = path.resolve(dirname, "_doc-models", version);

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
