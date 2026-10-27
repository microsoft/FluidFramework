/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

describe("checkDebugAsserts", () => {
	it("examples", () => {
		// This file must be run after webpack.
		const bundle = readFileSync("./build/debugAssert.js", "utf-8");

		assert.match(bundle, /kept 1/);
		assert.match(bundle, /kept 2/);
		assert.match(bundle, /kept 3/);
		assert.doesNotMatch(bundle, /removed in production/);
	});

	it("SharedTree excludes unused rebase validation", () => {
		// This test must be run after webpack.
		const bundle = readFileSync("./build/sharedTree.js", "utf-8");
		assert.doesNotMatch(bundle, /rebase validation cannot be enabled/);
		assert.doesNotMatch(bundle, /nodeToParent table/);
	});
});
