/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * Fluid access-token minting.
 *
 * Produces the same token `@fluidframework/azure-service-utils` `generateToken` produces: an
 * HS256 JWT over the `ITokenClaims` shape, signed with the tenant's shared key. riddler
 * validates it with that same key, so the claim shape has to match exactly.
 *
 * Signing is done with `node:crypto` rather than a JWT library. An HS256 JWT is
 * `base64url(header).base64url(payload).base64url(HMAC-SHA256(...))`, so the dependency buys
 * little, and avoiding it keeps this logic testable with no install step.
 */

const crypto = require("node:crypto");

function base64url(input) {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/**
 * Build the Fluid token claims.
 *
 * `iat` and `exp` are both set explicitly. riddler's `validateTokenClaimsExpiration` requires
 * both to be present and checks `exp - iat` against its configured `maxTokenLifetimeSec`, so
 * omitting either produces a token rejected at connect time once token expiration is enabled.
 *
 * @param params - `{ tenantId, documentId, user, scopes, lifetimeSec, now }`.
 *   `now` is epoch seconds, injectable so tests are not clock-dependent.
 */
function buildClaims({ tenantId, documentId, user, scopes, lifetimeSec, now }) {
	const issuedAt = now ?? Math.round(Date.now() / 1000);

	return {
		documentId: documentId ?? "",
		scopes,
		tenantId,
		user,
		iat: issuedAt,
		exp: issuedAt + lifetimeSec,
		ver: "1.0",
		// A unique id per token, so an operator correlating logs can identify a single issuance
		// and revocation infrastructure has something stable to name.
		jti: crypto.randomUUID(),
	};
}

/**
 * Sign claims as a compact HS256 JWT.
 *
 * @param claims - Payload object.
 * @param key - The tenant's shared signing key.
 */
function signToken(claims, key) {
	if (!key) {
		throw new Error("Cannot sign a token without a tenant key.");
	}

	const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
	const payload = base64url(JSON.stringify(claims));
	const signingInput = `${header}.${payload}`;
	const signature = crypto.createHmac("sha256", key).update(signingInput).digest();

	return `${signingInput}.${base64url(signature)}`;
}

/**
 * Build and sign a Fluid access token in one step.
 */
function mintToken(params, key) {
	return signToken(buildClaims(params), key);
}

module.exports = {
	base64url,
	buildClaims,
	mintToken,
	signToken,
};
