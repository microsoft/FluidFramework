/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { stripUndefined } from "../benchmarkAuthoringUtilities.js";

describe("benchmarkAuthoringUtilities", () => {
	it("stripUndefined", () => {
		assert.deepEqual(stripUndefined({ a: 1, b: undefined }), { a: 1 });
	});
});
