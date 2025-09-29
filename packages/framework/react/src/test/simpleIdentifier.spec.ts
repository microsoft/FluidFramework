/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { objectIdNumber } from "../simpleIdentifier.js";

describe("simpleIdentifier", () => {
	it("objectIdNumber", () => {
		const a: object = {};
		const b: object = {};
		const aId = objectIdNumber(a);
		const bId = objectIdNumber(b);
		assert.equal(aId, objectIdNumber(a));
		assert.equal(bId, objectIdNumber(b));
		assert.notEqual(aId, bId);
	});
});
