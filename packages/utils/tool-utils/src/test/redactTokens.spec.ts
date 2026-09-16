/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { redactTokens } from "../redactTokens.js";

describe("redactTokens", () => {
	it("never includes the token values", () => {
		const out = redactTokens({
			accessToken: "super-secret-access-jwt",
			refreshToken: "super-secret-refresh",
		});
		assert.ok(!out.includes("super-secret-access-jwt"), "accessToken value must not leak");
		assert.ok(!out.includes("super-secret-refresh"), "refreshToken value must not leak");
	});

	it("reports presence and length of the access token", () => {
		const out = redactTokens({ accessToken: "abcde" });
		assert.ok(out.includes("accessToken:present(len=5)"), out);
		assert.ok(out.includes("refreshToken:absent"), out);
	});

	it("includes non-secret timing fields", () => {
		const out = redactTokens({ accessToken: "x", receivedAt: 100, expiresIn: 3600 });
		assert.ok(out.includes("receivedAt:100"), out);
		assert.ok(out.includes("expiresIn:3600"), out);
	});

	it("handles an undefined tokens object", () => {
		assert.strictEqual(redactTokens(undefined), "tokens=undefined");
	});
});
