/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs-extra");
const path = require("path");
const {
	params: { currentVersion, ltsVersion },
} = require("../data/versions.json");

const configFileName = "staticwebapp.config.json";
const config = require(`../static/${configFileName}`);

const routes = {
	"/docs/apis/{*}": `/docs/api/${currentVersion}/{*}`,
	"/docs/api/current/{*}": `/docs/api/${currentVersion}/{*}`,
	"/docs/api/lts/{*}": `/docs/api/${ltsVersion}/{*}`,
};

/**
 * Reads FF versions, generates redirects, and write redirect rules to azure webapp config json.
 */
async function buildRedirects() {
	config.routes = Object.entries(routes).map(([route, redirect]) => ({
		route,
		redirect,
		statusCode: 301,
	}));

	await fs.writeFile(
		path.join(__dirname, "..", "static", configFileName),
		JSON.stringify(config, null, 2),
		"utf8",
	);
}

module.exports = { buildRedirects };
