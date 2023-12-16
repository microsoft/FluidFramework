/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs-extra");
const path = require("path");

const versions = require("../data/versions.json");
const config = require("../staticwebapp.config.json");

const statusCode = 301;
const { currentVersion, ltsVersion } = versions.params;

const routes = {
	"/docs/apis/": `/docs/api/${currentVersion}`,
	"/docs/api/current": `/docs/api/${currentVersion}`,
	"/docs/api/lts": `/docs/api/${ltsVersion}`,
};

/**
 * Processes versions and generates Aliases for redirects.
 */
async function buildRedirects() {
	config.routes = Object.entries(routes).map(([key, value]) => ({
		route: key,
		redirect: value,
		statusCode,
	}));

	await saveToFile("staticwebapp.config.json", config);
}

const saveToFile = async (filename, data) => {
	const filePath = path.join(__dirname, "..", filename);
	await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

module.exports = {
	buildRedirects,
};
