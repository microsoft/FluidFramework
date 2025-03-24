/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// Since bundle size reporter is broken, and doesn't block merges, do a sanity check here
describe("checkSizes", () => {
	it("sharedTreeAttributes", () => {
		// This test must be run after webpack.
		const bundle = readFileSync("./dist/sharedTreeAttributes.js", "utf-8");

		// Make sure it contains something
		assert(bundle.length > 10);
		// Make sure does not contain a lot more than just the attributes.
		assert(bundle.length < 1000);
	});
});
