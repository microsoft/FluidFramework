/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This script builds FF.com's redirects
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import fs from "fs-extra";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const {
	params: { currentVersion, ltsVersion },
} = await fs.readJSON(path.resolve(dirname, "data", "versions.json"));

try {
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
	const { pathname, search } = new URL(headers["x-ms-original-url"]);
	const route = [...routes].find(([path, _]) => pathname.startsWith(path));

	context.res = {
		status: route ? 302 : 404,
		headers: { location: route ? \`\${pathname.replace(...route)}\${search}\` : "/404" },
	};
};
`;
	const versionPath = path.resolve(dirname, "api", "fallback", "index.js");
	await fs.writeFile(versionPath, content);
} catch (error) {
	console.error(chalk.red("Redirects could not be generated due to one or more errors:"));
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("Redirects generated!"));
process.exit(0);
