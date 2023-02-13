/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { add } from "fluid-wasm";

describe("WASM", () => {
	it("can add two numbers", () => {
		assert.strictEqual(add(1, 2), 3);
	});
});