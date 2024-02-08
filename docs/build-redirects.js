/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * This script creates a versions file for FF.com redirects based on current and lts versions.
 * It reads the current and LTS version numbers from `docs/data/versions.json`,
 * and writes these to `/docs/api/fallback/versions.json`.
 */

const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const {
	params: { currentVersion, ltsVersion },
} = require("./data/versions.json");

const destination = path.resolve(__dirname, "api", "fallback", "versions.json");

const buildRedirectJson = () =>
	fs.writeFile(destination, JSON.stringify({ currentVersion, ltsVersion }, null, "\t") + "\n");

buildRedirectJson().then(
	() => {
		console.log(chalk.green(`Wrote redirects file to ${destination}`));
		process.exit(0);
	},
	(error) => {
		console.error(chalk.red(`Could not write redirects file to ${destination}`));
		console.error(error);
		process.exit(1);
	},
);
