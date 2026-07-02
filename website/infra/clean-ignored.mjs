/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { simpleGit, CleanOptions } from "simple-git";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRootDirectory = path.join(dirname, "..");

const git = simpleGit({ cwd: docsRootDirectory });

/**
 * Cleans up all git-ignored files under the provided path.
 * @param {string} pathSpec - The path to clean. Expressed relative to the root of the docs directory.
 */
export async function cleanIgnored(pathSpec) {
	await git.clean(CleanOptions.FORCE + CleanOptions.IGNORED_ONLY, [pathSpec]);
}
