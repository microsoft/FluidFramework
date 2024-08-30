/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { expect } from "chai";
import { describe, it } from "mocha";

// import { type PackageJson } from "../interfaces.js";
import { loadFluidRepo } from "../fluidRepo.js";
import type { WorkspaceName } from "../types.js";
// import { testDataPath } from "./init.js";

describe("loadFluidRepo", () => {
	it("loads correctly", () => {
		const repo = loadFluidRepo();
		assert.strictEqual(
			repo.workspaces.size,
			14,
			`Expected 5 workspaces, found ${repo.workspaces.size}`,
		);

		const client = repo.workspaces.get("client" as WorkspaceName);
		expect(client).to.not.be.undefined;
		expect(client?.packages.length).to.equal(159);
		expect(client?.releaseGroups.size).to.equal(2);
		console.debug(client?.releaseGroups);
	});

	// it("detects tabs indentation", () => {
	// 	const testFile = path.resolve(testDataPath, "tabs/_package.json");
	// 	const [, indent] = readPackageJsonAndIndent(testFile);
	// 	const expectedIndent = "\t";
	// 	assert.strictEqual(indent, expectedIndent);
	// });
});
