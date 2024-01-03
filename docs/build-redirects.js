/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This script reads FF versions, generates redirects, and write redirect rules to azure webapp config json.
 */

const chalk = require("chalk");
const fs = require("fs-extra");
const path = require("path");
const {
	params: { currentVersion },
} = require("./data/versions.json");

const configFileName = "staticwebapp.config.json";
const config = require(`./static/${configFileName}`);

const routes = {
	"/docs/apis": `/docs/api/${currentVersion}`,
	// "/docs/api/current/*": `/docs/api/${currentVersion}/*`,
	// "/docs/api/lts/*": `/docs/api/${ltsVersion}/*`,
};

config.routes = Object.entries(routes).map(([route, redirect]) => ({
	route,
	redirect,
	statusCode: 301,
}));

fs.writeFile(
	path.join(__dirname, "static", configFileName),
	JSON.stringify(config, null, 2),
	"utf8",
).then(
	() => {
		console.log(chalk.green("Redirects file generated!"));
	},
	() => {
		process.exit(1);
	},
);
