/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import config from "../config/docs-versions.mjs";
import { cleanIgnored } from "./clean-ignored.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRootDirectory = path.join(dirname, "..");

/**
 * Cleans all generated API documentation files.
 *
 * @remarks
 * The API docs directories contain a mix of generated and manually authored files, so cleaning is not
 * as simple as just deleting the entire directory.
 * To better support this pattern, this script uses `git clean` to remove only the files that are git-ignored,
 * and leave other files intact.
 */

// Build list of paths from our config's set of API docs versions.
// Expressed relative to the root of the docs directory.
const apiDocsPaths = [
	path.relative(docsRootDirectory, config.currentVersion.apiDocs.outputPath),
	...config.otherVersions.map((versionConfig) =>
		path.relative(docsRootDirectory, versionConfig.apiDocs.outputPath),
	),
	path.relative(docsRootDirectory, config.local.apiDocs.outputPath),
];

console.log(`Cleaning generated API documentation under: [${apiDocsPaths.join(", ")}]...`);
try {
	await Promise.all(apiDocsPaths.map(async (pathSpec) => cleanIgnored(pathSpec)));
} catch (error) {
	console.error("Error cleaning API docs:", error);
	process.exit(1);
}

console.log("API documentation cleaned successfully.");
