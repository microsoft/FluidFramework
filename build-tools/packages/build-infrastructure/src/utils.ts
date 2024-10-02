/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import execa from "execa";

import { NotInGitRepository } from "./errors";

/**
 * Returns the absolute path to the nearest Git repository root found starting at `cwd`.
 *
 * @param cwd - The working directory to use to start searching for Git repositories. Defaults to `process.cwd()` if not
 * provided.
 *
 * @privateRemarks
 * This function is helpful because it is synchronous. The SimpleGit wrapper is async-only.
 */
export function findGitRootSync(cwd = process.cwd()): string {
	const result = execa.sync("git", ["rev-parse", "--show-toplevel"], {
		cwd,
		encoding: "utf8",
		// Ignore stdin but pipe (capture) stdout and stderr since git will write to both.
		stdio: ["ignore", "pipe", "pipe"],
	});

	// If anything was written to stderr, then it's not a git repo.
	if (result.stderr) {
		throw new NotInGitRepository(cwd);
	}

	return result.stdout.trim();
}

/**
 * Returns the absolute path to the nearest Git repository found starting at `cwd`.
 *
 * @param cwd - The working directory to use to start searching for Git repositories. Defaults to `process.cwd()` if not
 * provided.
 *
 * @privateRemarks
 * This function is helpful because it is synchronous. The SimpleGit wrapper is async-only.
 */
export function isInGitRepositorySync(cwd = process.cwd()): boolean {
	const result = execa.sync("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd,
		encoding: "utf8",
		// Ignore stdin but pipe (capture) stdout and stderr since git will write to both - we will only check stdout though
		stdio: ["ignore", "pipe", "pipe"],
	});

	const isInWorktree = result.stdout.trim() === "true";
	return isInWorktree;
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
