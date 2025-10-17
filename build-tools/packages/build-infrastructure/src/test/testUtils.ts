/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { copy } from "fs-extra/esm";

import { testRepoRoot as originalTestRepoRoot } from "./init.js";

/**
 * Creates a temporary copy of the test repository to avoid using git operations
 * that could silently revert local changes in the source repository.
 *
 * @returns An object containing the path to the temporary test repo and a cleanup function
 */
export async function setupTestRepo(): Promise<{
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

	const cleanup = async (): Promise<void> => {
		await rm(tempDir, { recursive: true, force: true });
	};

	return { testRepoRoot, cleanup };
}
