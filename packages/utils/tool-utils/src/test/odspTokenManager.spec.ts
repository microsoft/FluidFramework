/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type LoginCredentials, OdspTokenManager } from "../odspTokenManager.js";

/**
 * Build a syntactically valid JWT (header.payload.signature) whose payload carries the given
 * `iat`/`exp` claims. Only the payload is meaningful to the token manager's parsing.
 */
function makeJwt(iat: number, exp: number): string {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
		"base64url",
	);
	const payload = Buffer.from(JSON.stringify({ iat, exp })).toString("base64url");
	return `${header}.${payload}.signature`;
}

describe("OdspTokenManager token redaction", () => {
	it("does not embed the acquired access token in the thrown error message", async () => {
		const now = Math.floor(Date.now() / 1000);
		// Storage tokens use the JWT iat/exp claims: iat in the past with a tiny lifetime fails the
		// 60s validity buffer, forcing the "acquired invalid tokens" throw with a real access token.
		const jwt = makeJwt(now - 10, now);
		const credentials: LoginCredentials = {
			type: "fic",
			username: "test-user",
			fetchToken: async () => jwt,
		};
		const manager = new OdspTokenManager();

		await assert.rejects(manager.getOdspTokens(credentials), (error: Error) => {
			assert.ok(
				!error.message.includes(jwt),
				"the access token JWT must not appear in the error message",
			);
			assert.ok(
				!error.message.includes("eyJ"),
				"no JWT-looking base64 segment should appear in the error message",
			);
			assert.ok(
				error.message.includes("accessToken:present(len="),
				`error message should carry the redacted token shape, got: ${error.message}`,
			);
			return true;
		});
	});

	it("returns a valid, non-expired token without throwing", async () => {
		const now = Math.floor(Date.now() / 1000);
		const jwt = makeJwt(now, now + 3600);
		const credentials: LoginCredentials = {
			type: "fic",
			username: "test-user",
			fetchToken: async () => jwt,
		};
		const manager = new OdspTokenManager();

		const tokens = await manager.getOdspTokens(credentials);
		assert.strictEqual(tokens.accessToken, jwt);
	});
});
