/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This download script is used to download the api json docs from the azure storage.
 * Saves each model under `_doc-models/<version>`.
 */

const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const {
	params: { currentVersion, ltsVersion },
} = require("./data/versions.json");

const destination = path.resolve(__dirname, "api", "fallback", "versions.json");

const buildRedirectJson = async () => {
	await fs.writeFile(destination, JSON.stringify({ currentVersion, ltsVersion }, null, 4));
};

buildRedirectJson().then(
	() => {
		console.log(chalk.green(`Wrote redirects file to ${destination}`));
		process.exit(0);
	},
	(error) => {
		console.error(
			chalk.red(`Could not write redirects file to ${destination}`),
		);
		console.error(error);
		process.exit(1);
	},
);
