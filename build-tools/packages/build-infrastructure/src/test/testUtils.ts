/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { copy } from "fs-extra/esm";
import { simpleGit } from "simple-git";

import { testRepoRoot as originalTestRepoRoot } from "./init.js";

/**
 * Creates a temporary copy of the test repository to avoid using git operations
 * that could silently revert local changes in the source repository.
 *
 * @param initGit - Whether to initialize the temp directory as a git repository with an initial commit.
 * This is required for tests that need to use git operations like `git add` or detect changes.
 * @returns An object containing the path to the temporary test repo and a cleanup function
 */
export async function setupTestRepo(initGit: boolean = false): Promise<{
	testRepoRoot: string;
	cleanup: () => Promise<void>;
}> {
	// Create a temporary directory
	const tempDir = await mkdtemp(path.join(tmpdir(), "fluid-test-repo-"));
	const testRepoRoot = path.join(tempDir, "testRepo");

	// Copy the test repo to the temporary directory
	await copy(originalTestRepoRoot, testRepoRoot, {
		// Preserve timestamps to avoid unnecessary git change detection
		preserveTimestamps: true,
	});

	if (initGit) {
		// Initialize a git repository and commit all files
		const git = simpleGit(testRepoRoot);
		await git.init();
		await git.add(".");
		await git.commit("Initial commit");
	}

	const cleanup = async (): Promise<void> => {
		await rm(tempDir, { recursive: true, force: true });
	};

	return { testRepoRoot, cleanup };
}
