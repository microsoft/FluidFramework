/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This script builds FF.com's redirects
 */

const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const {
	params: { currentVersion, ltsVersion },
} = require("./data/versions.json");

const buildRedirects = async () => {
	const content = `/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Map of incoming URL paths to redirect URLs
const routes = new Map([
	["/docs/apis", "/docs/api/${currentVersion}"],
	["/docs/api/current", "/docs/api/${currentVersion}"],
	["/docs/api/lts", "/docs/api/${ltsVersion}"],
]);

/**
 * Handles incoming HTTP requests and redirects them to the appropriate URL based on the current and LTS versions.
 * It reads the versions from /docs/data/versions.json and matches the incoming URL to a set of predefined routes.
 * If a matching route is found, it constructs and returns the redirect URL. Otherwise, it returns a 404 response.
 */
module.exports = async (context, { headers }) => {
	const route = [...routes].find(([path, _]) => headers["x-ms-original-url"].includes(path));

	context.res = {
		status: route ? 302 : 404,
		headers: { location: route ? headers["x-ms-original-url"].replace(...route) : "/404" },
	};
};
`;
	const versionPath = path.resolve(__dirname, "api", "fallback", "index.js");
	await fs.writeFile(versionPath, content);
};

buildRedirects().then(
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
