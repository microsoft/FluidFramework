/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { expect } from "chai";
import { after, afterEach, before, describe, it } from "mocha";
import * as semver from "semver";

import { loadBuildProject } from "../buildProject.js";
import type { IReleaseGroup, IWorkspace, ReleaseGroupName, WorkspaceName } from "../types.js";
import { setVersion } from "../versions.js";

import { setupTestRepo } from "./testUtils.js";

describe("setVersion", () => {
	let testRepoRoot: string;
	let cleanup: () => Promise<void>;
	let repo: ReturnType<typeof loadBuildProject>;
	let main: IReleaseGroup;
	let group2: IReleaseGroup;
	let group3: IReleaseGroup;
	let secondWorkspace: IWorkspace;

	before(async () => {
		const setup = await setupTestRepo();
		testRepoRoot = setup.testRepoRoot;
		cleanup = setup.cleanup;

		repo = loadBuildProject(testRepoRoot);
		main = repo.releaseGroups.get("main" as ReleaseGroupName);
		assert(main !== undefined);

		group2 = repo.releaseGroups.get("group2" as ReleaseGroupName);
		assert(group2 !== undefined);

		group3 = repo.releaseGroups.get("group3" as ReleaseGroupName);
		assert(group3 !== undefined);

		secondWorkspace = repo.workspaces.get("second" as WorkspaceName);
		assert(secondWorkspace !== undefined);
	});

	after(async () => {
		await cleanup();
	});

	afterEach(() => {
		repo.reload();
	});

	it("release group", async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(main.packages, semver.parse("1.2.1")!);

		const allCorrect = main.packages.every((pkg) => pkg.version === "1.2.1");
		expect(main.version).to.equal("1.2.1");
		expect(allCorrect).to.be.true;
	});

	it("workspace", async () => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(secondWorkspace.packages, semver.parse("2.2.1")!);

		const allCorrect = secondWorkspace.packages.every((pkg) => pkg.version === "2.2.1");
		expect(allCorrect).to.be.true;
	});

	it("repo", async () => {
		const packages = [...repo.packages.values()];
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		await setVersion(packages, semver.parse("1.2.1")!);

		const allCorrect = packages.every((pkg) => pkg.version === "1.2.1");
		expect(allCorrect).to.be.true;
	});
});
