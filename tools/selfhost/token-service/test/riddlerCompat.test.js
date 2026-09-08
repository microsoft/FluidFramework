/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * Compatibility tests against routerlicious' own validation rules.
 *
 * A token this service mints is only useful if riddler accepts it. Rather than assert on our
 * own idea of a valid token, this file reimplements routerlicious' checks verbatim and runs
 * our output through them.
 *
 * Sources, so these can be re-checked when routerlicious changes:
 *   validateTokenClaims           - server/routerlicious/packages/services-utils/src/auth.ts
 *   validateTokenClaimsExpiration - server/routerlicious/packages/services-client/src/auth.ts
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { handleTokenRequest } = require("../src/handler");
const { defaultPrincipalHeader, makeConfig, makeRequest } = require("./helpers");

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function decodeClaims(token) {
	return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

/** Signature check equivalent to `jwt.verify(token, key)` for HS256. */
function verifySignature(token, key) {
	const [header, payload, signature] = token.split(".");
	const expected = crypto
		.createHmac("sha256", key)
		.update(`${header}.${payload}`)
		.digest("base64url");

	// Constant-time comparison, matching how a JWT library compares signatures.
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verbatim port of routerlicious' validateTokenClaims. Throws with a `status` on rejection. */
function validateTokenClaims(claims, documentId, tenantId, requireDocumentId = true) {
	if (!claims) {
		throw Object.assign(new Error("Missing token claims."), { status: 403 });
	}
	if (claims.tenantId !== tenantId) {
		throw Object.assign(new Error("TenantId in token claims does not match request."), {
			status: 403,
		});
	}
	if (requireDocumentId && claims.documentId !== documentId) {
		throw Object.assign(new Error("DocumentId in token claims does not match request."), {
			status: 403,
		});
	}
	if (claims.scopes === undefined || claims.scopes === null || claims.scopes.length === 0) {
		throw Object.assign(new Error("Missing scopes in token claims."), { status: 403 });
	}
	return claims;
}

/** Verbatim port of routerlicious' validateTokenClaimsExpiration. */
function validateTokenClaimsExpiration(claims, maxTokenLifetimeSec) {
	if (!claims.exp || !claims.iat || claims.exp - claims.iat > maxTokenLifetimeSec) {
		throw Object.assign(new Error("Invalid token expiry"), { status: 403 });
	}
	const lifeTimeMSec = claims.exp * 1000 - new Date().getTime();
	if (lifeTimeMSec < 0) {
		throw Object.assign(new Error("Expired token"), { status: 401 });
	}
	return lifeTimeMSec;
}

async function mintFor(body = {}, configOverrides = {}) {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader(), body }),
		{ config: makeConfig({ tenantKey: KEY, ...configOverrides }) },
	);
	assert.equal(response.status, 200, "expected the request to be authorized");
	return response.jsonBody.token;
}

test("minted token passes routerlicious signature verification", async () => {
	assert.ok(verifySignature(await mintFor({ documentId: "doc-1" }), KEY));
});

test("minted token fails verification under a different tenant key", async () => {
	// Confirms the signature is actually bound to the key, so a wrong-key deployment is
	// detected rather than silently accepted.
	assert.ok(!verifySignature(await mintFor({ documentId: "doc-1" }), `${KEY.slice(0, -1)}0`));
});

test("minted token passes validateTokenClaims for its document", async () => {
	const claims = decodeClaims(await mintFor({ documentId: "doc-1" }));
	assert.doesNotThrow(() => validateTokenClaims(claims, "doc-1", "fluid"));
});

test("minted token is refused for a document it was not issued for", async () => {
	const claims = decodeClaims(await mintFor({ documentId: "doc-1" }));
	assert.throws(
		() => validateTokenClaims(claims, "doc-2", "fluid"),
		(error) => error.status === 403,
	);
});

test("tenant-scoped token passes validation when no document is required", async () => {
	// This is the shape the driver requests before a container id exists.
	const claims = decodeClaims(await mintFor({}));
	assert.doesNotThrow(() => validateTokenClaims(claims, "", "fluid", false));
});

test("minted token passes validateTokenClaimsExpiration at the default lifetime", async () => {
	const claims = decodeClaims(await mintFor({ documentId: "doc-1" }));
	assert.doesNotThrow(() => validateTokenClaimsExpiration(claims, 3600));
});

test("minted token survives the expiration check at riddler's exact ceiling", async () => {
	// `exp - iat > maxTokenLifetimeSec` is a strict comparison, so an exactly-equal lifetime
	// is valid. Config permits this, and this test pins that the boundary agrees.
	const claims = decodeClaims(
		await mintFor(
			{ documentId: "doc-1" },
			{ tokenLifetimeSec: 3600, maxTokenLifetimeSec: 3600 },
		),
	);
	assert.equal(claims.exp - claims.iat, 3600);
	assert.doesNotThrow(() => validateTokenClaimsExpiration(claims, 3600));
});

test("a lifetime above riddler's ceiling is what the config guard prevents", async () => {
	// Demonstrates the failure the config check exists to stop: if a longer lifetime ever
	// reached the signer, riddler would reject every token with 403.
	const claims = decodeClaims(
		await mintFor(
			{ documentId: "doc-1" },
			{ tokenLifetimeSec: 7200, maxTokenLifetimeSec: 7200 },
		),
	);
	assert.throws(
		() => validateTokenClaimsExpiration(claims, 3600),
		(error) => error.status === 403,
	);
});

test("an expired token is rejected with 401", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader(), body: { documentId: "doc-1" } }),
		{
			config: makeConfig({ tenantKey: KEY, tokenLifetimeSec: 60 }),
			now: Math.round(Date.now() / 1000) - 3600,
		},
	);

	const claims = decodeClaims(response.jsonBody.token);
	assert.throws(
		() => validateTokenClaimsExpiration(claims, 3600),
		(error) => error.status === 401,
	);
});

test("minted token retains iat, which the earlier prototype silently dropped", async () => {
	// The predecessor signed with `jsonwebtoken` and `noTimestamp: true`, believing that
	// preserved its hand-set `iat`. That option deletes `iat` instead, and
	// validateTokenClaimsExpiration rejects a token without it. Every token the prototype
	// minted therefore fails with 403 once enableTokenExpiration is on. Signing directly is
	// what avoids re-introducing that, so the presence of `iat` is pinned here.
	const claims = decodeClaims(await mintFor({ documentId: "doc-1" }));

	assert.ok("iat" in claims, "iat must be present or riddler rejects the token");
	assert.equal(typeof claims.iat, "number");

	const withoutIat = { ...claims };
	delete withoutIat.iat;
	assert.throws(
		() => validateTokenClaimsExpiration(withoutIat, 3600),
		(error) => error.status === 403,
	);
});

test("minted token carries the claim fields routerlicious reads", async () => {
	const claims = decodeClaims(await mintFor({ documentId: "doc-1" }));

	assert.equal(typeof claims.tenantId, "string");
	assert.equal(typeof claims.documentId, "string");
	assert.ok(Array.isArray(claims.scopes) && claims.scopes.length > 0);
	assert.equal(typeof claims.user, "object");
	assert.equal(typeof claims.iat, "number");
	assert.equal(typeof claims.exp, "number");
	assert.equal(claims.ver, "1.0");
	assert.equal(typeof claims.jti, "string");
});
