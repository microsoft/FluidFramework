/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { base64url, buildClaims, mintToken, signToken } = require("../src/mint");
const { READ_WRITE_SCOPES } = require("../src/authorize");

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function decodeSegment(segment) {
	return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

test("buildClaims produces the ITokenClaims shape riddler expects", () => {
	const claims = buildClaims({
		tenantId: "fluid",
		documentId: "doc-1",
		user: { id: "user-1", name: "Ada" },
		scopes: READ_WRITE_SCOPES,
		lifetimeSec: 3600,
		now: 1_700_000_000,
	});

	assert.deepEqual(Object.keys(claims).sort(), [
		"documentId",
		"exp",
		"iat",
		"jti",
		"scopes",
		"tenantId",
		"user",
		"ver",
	]);
	assert.equal(claims.ver, "1.0");
	assert.equal(claims.iat, 1_700_000_000);
	assert.equal(claims.exp, 1_700_003_600);
});

test("buildClaims defaults a missing documentId to an empty string", () => {
	// Tenant-scoped tokens are requested before a container exists, so the field must be
	// present and empty rather than undefined, which would drop out of the JSON entirely.
	const claims = buildClaims({
		tenantId: "fluid",
		user: { id: "u" },
		scopes: READ_WRITE_SCOPES,
		lifetimeSec: 60,
		now: 1,
	});
	assert.equal(claims.documentId, "");
});

test("buildClaims issues a unique jti per token", () => {
	const params = {
		tenantId: "fluid",
		user: { id: "u" },
		scopes: READ_WRITE_SCOPES,
		lifetimeSec: 60,
		now: 1,
	};
	assert.notEqual(buildClaims(params).jti, buildClaims(params).jti);
});

test("signToken emits a compact HS256 JWT", () => {
	const token = signToken({ hello: "world" }, KEY);
	const [header, payload, signature] = token.split(".");

	assert.deepEqual(decodeSegment(header), { alg: "HS256", typ: "JWT" });
	assert.deepEqual(decodeSegment(payload), { hello: "world" });
	assert.ok(signature.length > 0);
	assert.ok(!token.includes("="), "base64url output must not be padded");
	assert.ok(!/[+/]/.test(token), "base64url output must not contain + or /");
});

test("signToken signature verifies against an independent HMAC", () => {
	const token = signToken({ hello: "world" }, KEY);
	const [header, payload, signature] = token.split(".");

	const expected = crypto
		.createHmac("sha256", KEY)
		.update(`${header}.${payload}`)
		.digest("base64url");

	assert.equal(signature, expected);
});

test("signToken produces a different signature under a different key", () => {
	assert.notEqual(signToken({ a: 1 }, KEY), signToken({ a: 1 }, `${KEY}00`));
});

test("signToken refuses to sign without a key", () => {
	assert.throws(() => signToken({ a: 1 }, undefined), /without a tenant key/);
});

test("base64url encodes without padding or unsafe characters", () => {
	assert.equal(base64url("a"), "YQ");
	assert.equal(base64url(Buffer.from([0xfb, 0xff])), "-_8");
});

test("mintToken round-trips claims through a signed token", () => {
	const token = mintToken(
		{
			tenantId: "fluid",
			documentId: "doc-1",
			user: { id: "user-1", name: "Ada" },
			scopes: READ_WRITE_SCOPES,
			lifetimeSec: 1800,
			now: 1_700_000_000,
		},
		KEY,
	);

	const claims = decodeSegment(token.split(".")[1]);
	assert.equal(claims.tenantId, "fluid");
	assert.equal(claims.documentId, "doc-1");
	assert.deepEqual(claims.user, { id: "user-1", name: "Ada" });
	assert.equal(claims.exp - claims.iat, 1800);
});
