/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import path from "node:path";
import { expect } from "chai";
import { describe, it } from "mocha";

import { loadFluidRepo } from "../fluidRepo.js";
import type { WorkspaceName } from "../types.js";
// import { findGitRoot } from "../utils.js";
import { testDataPath } from "./init.js";

describe("loadFluidRepo", () => {
	it("loads correctly", () => {
		const repo = loadFluidRepo(path.join(testDataPath, "./testRepo"));
		assert.strictEqual(
			repo.workspaces.size,
			2,
			`Expected 2 workspaces, found ${repo.workspaces.size}`,
		);

		const client = repo.workspaces.get("main" as WorkspaceName);
		expect(client).to.not.be.undefined;
		expect(client?.packages.length).to.equal(
			4,
			"main workspace has the wrong number of packages",
		);
		expect(client?.releaseGroups.size).to.equal(
			1,
			"main workspace has the wrong number of release groups",
		);

		const second = repo.workspaces.get("second" as WorkspaceName);
		expect(second).to.not.be.undefined;
		expect(second?.packages.length).to.equal(
			3,
			"second workspace has the wrong number of packages",
		);
		expect(second?.releaseGroups.size).to.equal(
			1,
			"second workspace has the wrong number of release groups",
		);
	});
});
