/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { expect } from "chai";
import { describe, it } from "mocha";

import { loadFluidRepo } from "../fluidRepo.js";
import type { WorkspaceName } from "../types.js";
import { findGitRoot } from "../utils.js";

describe("loadFluidRepo", () => {
	it("loads correctly", () => {
		const repo = loadFluidRepo(findGitRoot());
		assert.strictEqual(
			repo.workspaces.size,
			14,
			`Expected 14 workspaces, found ${repo.workspaces.size}`,
		);

		const client = repo.workspaces.get("client" as WorkspaceName);
		expect(client).to.not.be.undefined;
		expect(client?.packages.length).to.equal(
			153,
			"client workspace has the wrong number of packages",
		);
		expect(client?.releaseGroups.size).to.equal(
			1,
			"client workspace has the wrong number of release groups",
		);

		const buildTools = repo.workspaces.get("build-tools" as WorkspaceName);
		expect(buildTools).to.not.be.undefined;
		expect(buildTools?.packages.length).to.equal(
			6,
			"build-tools workspace has the wrong number of packages",
		);
		expect(buildTools?.releaseGroups.size).to.equal(
			1,
			"build-tools workspace has the wrong number of release groups",
		);
	});
});
