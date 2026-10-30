/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

describe("ADO JUnit reporting probe (remove before merge)", () => {
	it("intentionally fails with a colored assertion diff", () => {
		// With the pipeline's FORCE_COLOR=1, Node.js embeds ANSI escapes in this assertion error.
		assert.deepEqual(["actual"], ["expected"]);
	});
});
