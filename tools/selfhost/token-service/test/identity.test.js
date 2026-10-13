/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { IdentityError, extractPrincipal } = require("../src/identity");
const { CLAIM_OID, CLAIM_TID, defaultPrincipalHeader, encodePrincipal } = require("./helpers");

function headersWith(value) {
	return { "x-ms-client-principal": value };
}

test("extractPrincipal fails closed when Easy Auth is absent", () => {
	// The most important assertion in this suite. Without it, a Function App whose
	// authentication was never enabled would silently mint tokens for anonymous callers.
	assert.throws(
		() => extractPrincipal({}),
		(error) => error instanceof IdentityError && error.status === 401,
	);
});

test("extractPrincipal returns the verified identity", () => {
	const principal = extractPrincipal(headersWith(defaultPrincipalHeader()));

	assert.equal(principal.id, "11111111-2222-3333-4444-555555555555");
	assert.equal(principal.name, "Ada Lovelace");
	assert.equal(principal.insecureLocalDev, false);
});

test("extractPrincipal prefers the object id over mutable identifiers", () => {
	// Email and UPN can be reassigned to a different person; oid cannot.
	const principal = extractPrincipal(
		headersWith(defaultPrincipalHeader({ oid: "stable-oid" })),
	);
	assert.equal(principal.id, "stable-oid");
});

test("extractPrincipal rejects an undecodable header", () => {
	assert.throws(
		() => extractPrincipal(headersWith("!!!not base64 json!!!")),
		(error) => error.status === 401,
	);
});

test("extractPrincipal rejects a principal with no claims", () => {
	assert.throws(
		() => extractPrincipal(headersWith(encodePrincipal([]))),
		(error) => error.status === 401,
	);
});

test("extractPrincipal rejects a principal with no object identifier", () => {
	assert.throws(
		() => extractPrincipal(headersWith(encodePrincipal([{ typ: "name", val: "No Id" }]))),
		(error) => error.status === 401,
	);
});

test("extractPrincipal rejects an identity from a different Entra tenant", () => {
	// Guards the multi-tenant App Registration case, where Entra would otherwise happily
	// authenticate users from any directory.
	assert.throws(
		() =>
			extractPrincipal(headersWith(defaultPrincipalHeader({ tid: "some-other-tenant" })), {
				entraTenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
			}),
		(error) => error instanceof IdentityError && error.status === 403,
	);
});

test("extractPrincipal allows a principal that carries no tenant claim", () => {
	// Easy Auth does not always surface the tenant id, and rejecting on its absence turns a
	// successful sign-in into a bodiless 403. The issuer pinning in front of this is what
	// actually constrains the directory.
	const principal = extractPrincipal(
		headersWith(encodePrincipal([{ typ: CLAIM_OID, val: "user-without-tid" }])),
		{ entraTenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47" },
	);
	assert.equal(principal.id, "user-without-tid");
	assert.equal(principal.tenantId, undefined);
});

test("extractPrincipal accepts an identity from the configured Entra tenant", () => {
	const principal = extractPrincipal(headersWith(defaultPrincipalHeader()), {
		entraTenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
	});
	assert.equal(principal.tenantId, "72f988bf-86f1-41af-91ab-2d7cd011db47");
});

test("extractPrincipal collects app roles", () => {
	const principal = extractPrincipal(
		headersWith(defaultPrincipalHeader({ roles: ["FluidCollaborator", "FluidReader"] })),
	);
	assert.deepEqual(principal.roles, ["FluidCollaborator", "FluidReader"]);
});

test("extractPrincipal falls back to the object id when no display name is present", () => {
	const principal = extractPrincipal(
		headersWith(encodePrincipal([{ typ: CLAIM_OID, val: "only-an-oid" }])),
	);
	assert.equal(principal.name, "only-an-oid");
});

test("extractPrincipal synthesises a local identity only when explicitly allowed", () => {
	const principal = extractPrincipal({}, { allowInsecureLocalDev: true });
	assert.equal(principal.insecureLocalDev, true);
	assert.equal(principal.id, "local-dev");
});

test("extractPrincipal reads headers from a get-style bag", () => {
	const value = defaultPrincipalHeader();
	const headers = { get: (name) => (name === "x-ms-client-principal" ? value : undefined) };
	assert.equal(extractPrincipal(headers).name, "Ada Lovelace");
});

test("extractPrincipal matches header names case-insensitively", () => {
	const principal = extractPrincipal({ "X-MS-CLIENT-PRINCIPAL": defaultPrincipalHeader() });
	assert.equal(principal.name, "Ada Lovelace");
});

test("extractPrincipal reads the tenant id claim", () => {
	const principal = extractPrincipal(
		headersWith(
			encodePrincipal([
				{ typ: CLAIM_OID, val: "x" },
				{ typ: CLAIM_TID, val: "t1" },
			]),
		),
	);
	assert.equal(principal.tenantId, "t1");
});
