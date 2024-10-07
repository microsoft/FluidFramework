/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";

import ApiDocsVersions from "../api-docs-versions.mjs";
import { renderApiDocumentation } from "./api-markdown-documenter/index.mjs";

/*
 * This index script Generates API documentation for all API versions specified in
 * `api-docs-versions.mjs`.
 */

try {
	await Promise.all(Object.entries(ApiDocsVersions).map(async ([version, config]) => {
		await renderApiDocumentation(
			config.inputPath,
			config.outputPath,
			config.uriRoot,
			version,
		);

		console.log(chalk.green(`Version "${version}" API docs written to "${config.outputPath}"!`));
	}));
} catch (error) {
	console.error(chalk.red("API docs generation failed due to one or more errors:"));
	console.error(error);
	process.exit(1);
}

console.log(chalk.green("All API docs written!"));
process.exit(0);
