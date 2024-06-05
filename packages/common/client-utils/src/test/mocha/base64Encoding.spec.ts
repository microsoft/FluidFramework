/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { fromBase64ToUtf8, fromUtf8ToBase64, toUtf8 } from "../../indexNode.js";

describe("base64Encoding", () => {
	it("round-trips correctly", async () => {
		const original = "hello world";
		const base64 = fromUtf8ToBase64(original);
		assert.equal(fromBase64ToUtf8(base64), original);
		assert.equal(toUtf8(base64, "base64"), original);
	});
});
