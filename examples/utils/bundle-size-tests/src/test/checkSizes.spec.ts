/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// Since bundle size analysis doesn't block regressions, do a sanity check here.
// This bundle should remain its current tiny size for the foreseeable future so putting a hard limit on its size should be ok.
// Additionally, this specific bundling scenario is regressed in the past, so protecting it with a regression test is known to have some value.
describe("checkSizes", () => {
	it("sharedTreeAttributes", () => {
		// This test must be run after webpack.
		const bundle = readFileSync("./build/sharedTreeAttributes.js", "utf-8");

		// Make sure it contains something
		assert(bundle.length > 10);
		// Make sure does not contain a lot more than just the attributes.
		assert(bundle.length < 1000);
	});
});
