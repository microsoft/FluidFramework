/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const chalk = require("chalk");

const { renderApiDocumentation } = require("./render-api-documentation");

renderApiDocumentation().then(
	() => {
		console.log(chalk.green("API docs written!"));
		process.exit(0);
	},
	(error) => {
		console.error("API docs could not be written due to an error:", error);
		process.exit(1);
	},
);
