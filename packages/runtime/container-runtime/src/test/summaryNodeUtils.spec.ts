/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { EscapedPath } from "../summary/summarizerNode/summarizerNodeUtils.js";

/**
 * These tests emulate the behavior that summarizeNode will use to build summary a handle id for each node in the summary
 * and test whether the path is built as expected. The motivation to add these tests is that the ids of data stores and DDSes can now be
 * special characters which must be dealt with caution when building ids of a summary tree.
 */
describe("Summary handle encoding works as expected", () => {
	it("Validate basic path append behavior", () => {
		const rootPath = EscapedPath.create("");
		assert.equal(rootPath.toString(), "");

		const childPath = EscapedPath.create("childIdMock");
		assert.equal(childPath.toString(), "childIdMock");

		const subChildPath = EscapedPath.create("subChildIdMock");
		const completePathToChild = childPath.createChildPath(subChildPath);
		assert.equal(completePathToChild.toString(), "childIdMock/.channels/subChildIdMock");
	});

	it("Validate basic path append behavior with special characters in path", () => {
		const parentPath = EscapedPath.create("@");
		assert.equal(parentPath.toString(), "@");

		const childPath = EscapedPath.create("&");
		assert.equal(childPath.toString(), "&");

		const completePath = parentPath.createChildPath(childPath);
		assert.equal(completePath.toString(), "@/.channels/&");
	});
});
