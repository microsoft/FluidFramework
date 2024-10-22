/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { expect } from "chai";
import { describe, it } from "mocha";

import { loadFluidRepo } from "../fluidRepo.js";
import type { WorkspaceName } from "../types.js";

import { testRepoRoot } from "./init.js";

describe("workspaces", () => {
	const repo = loadFluidRepo(testRepoRoot);
	const workspace = repo.workspaces.get("main" as WorkspaceName);

	it("checkInstall returns true", async () => {
		const actual = await workspace?.checkInstall();
		expect(actual).to.be.true;
	});

	it("install succeeds", async () => {
		await assert.doesNotReject(async () => {
			await workspace?.install(false);
		});
	});
});
