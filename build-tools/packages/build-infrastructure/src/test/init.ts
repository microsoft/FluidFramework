/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

import execa from "execa";
import { _dirname } from "./dirname.cjs";

export const packageRootPath = path.resolve(_dirname, "../..");

/**
 * Absolute path to the test data. It's rooted two directories up because the tests get executed from lib/.
 */
export const testDataPath = path.resolve(_dirname, packageRootPath, "src/test/data");

/**
 * Absolute path to the test repo.
 */
const testRepoTemplate = path.join(testDataPath, "testRepo");

function createTestRepo(): string {
	const repo = realpathSync.native(mkdtempSync(path.join(testDataPath, "testRepo-")));
	const cleanup = (): void => rmSync(repo, { recursive: true, force: true });
	process.once("exit", cleanup);
	process.once("SIGINT", () => {
		cleanup();
		process.exit(130);
	});
	process.once("SIGTERM", () => {
		cleanup();
		process.exit(143);
	});

	cpSync(testRepoTemplate, repo, {
		recursive: true,
		filter: (source) => path.basename(source) !== "node_modules",
	});
	execa.sync("git", ["init", "--quiet"], { cwd: repo });
	execa.sync("git", ["add", "--all"], { cwd: repo });
	execa.sync(
		"git",
		[
			"-c",
			"user.name=build-tools test",
			"-c",
			"user.email=build-tools-test@example.invalid",
			"commit",
			"--quiet",
			"-m",
			"Initial test fixture",
		],
		{ cwd: repo },
	);
	return repo;
}

/**
 * Absolute path to the isolated test repo.
 */
export const testRepoRoot = createTestRepo();
