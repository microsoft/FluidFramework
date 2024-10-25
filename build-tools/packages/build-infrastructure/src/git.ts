/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import execa from "execa";

import { NotInGitRepository } from "./errors.js";

/**
 * Returns the absolute path to the nearest Git repository root found starting at `cwd`.
 *
 * @param cwd - The working directory to use to start searching for Git repositories. Defaults to `process.cwd()` if not
 * provided.
 *
 * @throws A `NotInGitRepository` error if no git repo is found.
 *
 * @privateRemarks
 * This function is helpful because it is synchronous. The SimpleGit wrapper is async-only.
 */
export function findGitRootSync(cwd = process.cwd()): string {
	try {
		// This call will throw outside a git repo, which we'll catch and throw a NotInGitRepo error instead.
		const result = execa.sync("git", ["rev-parse", "--show-toplevel"], {
			cwd,
			encoding: "utf8",
			// Ignore stdin but pipe (capture) stdout and stderr since git will write to both.
			stdio: ["ignore", "pipe", "pipe"],
		});

		// If anything was written to stderr, then it's not a git repo.
		// This is likely unnecessary since the earlier exec call should throw, but just in case, throw here as well.
		if (result.stderr) {
			throw new NotInGitRepository(cwd);
		}

		return result.stdout.trim();
	} catch (error) {
		const message = (error as Error).message;
		if (message.includes("not a git repository")) {
			throw new NotInGitRepository(cwd);
		}
		throw error;
	}
}
