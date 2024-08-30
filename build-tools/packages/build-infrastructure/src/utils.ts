/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as childProcess from "node:child_process";
import path from "node:path";

/**
 * Returns the absolute path to the nearest Git repository found starting at `cwd`.
 *
 * @param cwd - The working directory to use to start searching for Git repositories. Defaults to `process.cwd()` if not
 * provided.
 */
export function findGitRoot(cwd?: string) {
	const gitRoot = childProcess
		.execSync("git rev-parse --show-toplevel", {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		})
		.trim();
	return gitRoot;
}

export function lookUpDirSync(dir: string, callback: (currentDir: string) => boolean) {
	let curr = path.resolve(dir);
	// eslint-disable-next-line no-constant-condition
	while (true) {
		if (callback(curr)) {
			return curr;
		}

		const up = path.resolve(curr, "..");
		if (up === curr) {
			break;
		}
		curr = up;
	}

	return undefined;
}
