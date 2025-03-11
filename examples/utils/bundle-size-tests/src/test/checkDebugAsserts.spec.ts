/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

describe("checkDebugAsserts", () => {
	it("examples", () => {
		// This file must be run after webpack.
		const bundle = readFileSync("./dist/debugAssert.js", "utf-8");

		assert.match(bundle, /kept 1/);
		assert.match(bundle, /kept 2/);
		assert.doesNotMatch(bundle, /removed in production/);
	});
});
