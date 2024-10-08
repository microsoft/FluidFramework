/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import chalk from "chalk";
import fs from "fs-extra";

import DocsVersions from "../config/docs-versions.mjs";
import { renderApiDocumentation } from "./api-markdown-documenter/index.mjs";

/*
 * This index script Generates API documentation for all API versions specified in
 * `api-docs-versions.mjs`.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Get versions from config
const versionConfigs = {};
versionConfigs[DocsVersions.currentVersion.version] = DocsVersions.currentVersion.apiDocs;
for (const versionConfig of DocsVersions.otherVersions) {
	versionConfigs[versionConfig.version] = versionConfig.apiDocs;
}

// Only include the local API docs version in dev mode
if (process.env.NODE_ENV === "development") {
	versionConfigs[DocsVersions.local.version] = DocsVersions.local.apiDocs;
}

try {
	// Generate API documentation for each version
	await Promise.all(Object.entries(versionConfigs).map(async ([version, config]) => {
		await renderApiDocumentation(
			config.inputPath,
			config.outputPath,
			config.uriRoot,
			version,
		);

		console.log(chalk.green(`Version "${version}" API docs written to "${config.outputPath}"!`));
	}));

	// Write build manifest file
	const versions = Object.keys(versionConfigs);
	const manifest = {
		apiDocsVersions: versions,
	}
	const manifestFilePath = path.join(dirname, "..", "api-docs-build-manifest.json");
	await fs.writeFile(manifestFilePath, JSON.stringify(manifest));

	console.log(chalk.green("API docs generated successfully!"));
	process.exit(0);
} catch (error) {
	console.error(chalk.red("API docs generation failed due to one or more errors:"));
	console.error(error);
	process.exit(1);
}
