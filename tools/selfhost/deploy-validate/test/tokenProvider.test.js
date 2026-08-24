/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const {
	buildTokenProvider,
	buildTokenServiceProvider,
	TokenServiceError,
} = require("../src/tokenProvider");

test("fetchOrdererToken returns a JWT signed with the given key, correct claims shape", async () => {
	const key = "test-key-0123456789";
	const provider = buildTokenProvider("fluid", key);
	const { jwt: token } = await provider.fetchOrdererToken("fluid", "doc-1");

	const decoded = jwt.verify(token, key, { algorithms: ["HS256"] });
	assert.equal(decoded.tenantId, "fluid");
	assert.equal(decoded.documentId, "doc-1");
	assert.equal(decoded.ver, "1.0");
	assert.ok(Array.isArray(decoded.scopes));
	assert.ok(decoded.scopes.includes("doc:read"));
	assert.ok(decoded.scopes.includes("doc:write"));
	assert.ok(decoded.scopes.includes("summary:write"));
	assert.ok(decoded.user && typeof decoded.user.id === "string");
});

test("fetchStorageToken returns a token for an empty documentId (container creation)", async () => {
	const key = "test-key-0123456789";
	const provider = buildTokenProvider("fluid", key);
	const { jwt: token } = await provider.fetchStorageToken("fluid", "");

	const decoded = jwt.verify(token, key, { algorithms: ["HS256"] });
	assert.equal(decoded.documentId, "");
});

test("rejects a token signed with the wrong key", async () => {
	const provider = buildTokenProvider("fluid", "right-key");
	const { jwt: token } = await provider.fetchOrdererToken("fluid", "doc-1");

	assert.throws(() => jwt.verify(token, "wrong-key", { algorithms: ["HS256"] }));
});

function tokenResponse(token = "fluid-jwt") {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		json: async () => ({
			token,
			expiresAt: Math.round(Date.now() / 1000) + 3600,
		}),
	};
}

test("token-service provider sends an authenticated POST JSON request", async () => {
	const calls = [];
	const provider = buildTokenServiceProvider(
		"https://tokens.example/api/token",
		async () => "entra-token",
		async (...args) => {
			calls.push(args);
			return tokenResponse();
		},
	);

	const result = await provider.fetchOrdererToken("fluid", "doc-1");

	assert.deepEqual(result, { jwt: "fluid-jwt", fromCache: false });
	assert.equal(calls.length, 1);
	assert.equal(calls[0][0], "https://tokens.example/api/token");
	assert.equal(calls[0][1].method, "POST");
	assert.equal(calls[0][1].headers.Authorization, "Bearer entra-token");
	assert.equal(calls[0][1].headers["Content-Type"], "application/json");
	assert.deepEqual(JSON.parse(calls[0][1].body), {
		tenantId: "fluid",
		documentId: "doc-1",
	});
});

test("token-service provider does not cache single-use tenant tokens", async () => {
	let requestCount = 0;
	const provider = buildTokenServiceProvider(
		"https://tokens.example/api/token",
		async () => "entra-token",
		async (_url, options) => {
			requestCount++;
			assert.deepEqual(JSON.parse(options.body), { tenantId: "fluid" });
			return tokenResponse(`fluid-jwt-${requestCount}`);
		},
	);

	const first = await provider.fetchStorageToken("fluid", "");
	const second = await provider.fetchStorageToken("fluid", "");

	assert.equal(first.jwt, "fluid-jwt-1");
	assert.equal(second.jwt, "fluid-jwt-2");
	assert.equal(requestCount, 2);
});

test("token-service provider caches document tokens and honors refresh", async () => {
	let requestCount = 0;
	const provider = buildTokenServiceProvider(
		"https://tokens.example/api/token",
		async () => "entra-token",
		async () => tokenResponse(`fluid-jwt-${++requestCount}`),
	);

	const first = await provider.fetchOrdererToken("fluid", "doc-1");
	const cached = await provider.fetchOrdererToken("fluid", "doc-1");
	const refreshed = await provider.fetchOrdererToken("fluid", "doc-1", true);

	assert.equal(first.fromCache, false);
	assert.deepEqual(cached, { jwt: "fluid-jwt-1", fromCache: true });
	assert.deepEqual(refreshed, { jwt: "fluid-jwt-2", fromCache: false });
	assert.equal(requestCount, 2);
});

test("token-service provider surfaces HTTP failures", async () => {
	const provider = buildTokenServiceProvider(
		"https://tokens.example/api/token",
		async () => "entra-token",
		async () => ({
			ok: false,
			status: 403,
			statusText: "Forbidden",
			text: async () => '{"error":"Access denied."}',
		}),
	);

	await assert.rejects(
		provider.fetchOrdererToken("fluid", "doc-1"),
		(error) =>
			error instanceof TokenServiceError &&
			error.status === 403 &&
			error.serviceMessage === "Access denied." &&
			/403 Forbidden.*Access denied/.test(error.message),
	);
});

for (const [name, payload] of [
	["missing expiry", { token: "missing-expiry" }],
	["null body", null],
]) {
	test(`token-service provider rejects malformed success response: ${name}`, async () => {
		const provider = buildTokenServiceProvider(
			"https://tokens.example/api/token",
			async () => "entra-token",
			async () => ({
				ok: true,
				status: 200,
				statusText: "OK",
				json: async () => payload,
			}),
		);

		await assert.rejects(
			provider.fetchOrdererToken("fluid", "doc-1"),
			(error) => error instanceof TokenServiceError && /invalid response/.test(error.message),
		);
	});
}
