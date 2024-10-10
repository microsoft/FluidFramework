/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

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
	try {
		const result = execa.sync("git", ["rev-parse", "--is-inside-work-tree"], {
			cwd,
			encoding: "utf8",
			// Ignore stdin, pipe (capture) stdout, and ignore stderr
			stdio: ["ignore", "pipe", "pipe"],
		});

		const isInWorktree = result.stdout.trim() === "true";
		return isInWorktree;
	} catch {
		return false;
	}
}

/**
 * Traverses up the directory tree from the given starting directory, applying the callback function to each directory.
 * If the callback returns `true` for any directory, that directory path is returned. If the root directory is reached
 * without the callback returning true, the function returns `undefined`.
 *
 * @param dir - The starting directory.
 * @param callback - A function that will be called for each path. If this function returns true, then the current path
 * will be returned.
 * @returns The first path for which the callback function returns true, or `undefined` if the root path is reached
 * without the callback returning `true`.
 */
export function lookUpDirSync(
	dir: string,
	callback: (currentDir: string) => boolean,
): string | undefined {
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
