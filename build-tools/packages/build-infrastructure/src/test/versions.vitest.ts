/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";

import * as semver from "semver";
import { simpleGit } from "simple-git";
import { afterEach, expect, describe, it } from "vitest";

import { loadBuildProject } from "../buildProject.js";
import type { ReleaseGroupName, WorkspaceName } from "../types.js";
import { setVersion } from "../versions.js";

import { pick, testDataPath, testRepoRoot } from "./init.js";

const repo = loadBuildProject(path.join(testDataPath, "./testRepo"));
const main = repo.releaseGroups.get("main" as ReleaseGroupName);
assert(main !== undefined);

const group2 = repo.releaseGroups.get("group2" as ReleaseGroupName);
assert(group2 !== undefined);

const group3 = repo.releaseGroups.get("group3" as ReleaseGroupName);
assert(group3 !== undefined);

const secondWorkspace = repo.workspaces.get("second" as WorkspaceName);
assert(secondWorkspace !== undefined);

/**
 * A git client rooted in the test repo. Used for resetting tests.
 */
const git = simpleGit(testRepoRoot);

describe("setVersion", () => {
	afterEach(async () => {
		await git.checkout(["HEAD", "--", testRepoRoot]);
		repo.reload();
	});

	it("release group", async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(main.packages, semver.parse("1.2.1")!);

		const results = main.packages.map((pkg) => {
			return pick(pkg.packageJson, ["name", "version"]);
		});

		expect(results).toMatchSnapshot();
	});

	it("workspace", async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(secondWorkspace.packages, semver.parse("2.2.1")!);

		const results = secondWorkspace.packages.map((pkg) => {
			return pick(pkg.packageJson, ["name", "version"]);
		});

		expect(results).toMatchSnapshot();
	});

	it("repo", async () => {
		const packages = [...repo.packages.values()];
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(packages, semver.parse("1.2.1")!);

		const results = packages.map((pkg) => {
			return pick(pkg.packageJson, ["name", "version"]);
		});

		expect(results).toMatchSnapshot();
	});
});
