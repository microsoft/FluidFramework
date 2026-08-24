/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { handleTokenRequest } = require("../src/handler");
const { READ_ONLY_SCOPES } = require("../src/authorize");
const { defaultPrincipalHeader, makeConfig, makeRequest } = require("./helpers");

function claimsOf(response) {
	return JSON.parse(
		Buffer.from(response.jsonBody.token.split(".")[1], "base64url").toString("utf8"),
	);
}

test("unauthenticated request is rejected with 401", async () => {
	const response = await handleTokenRequest(makeRequest(), { config: makeConfig() });

	assert.equal(response.status, 401);
	assert.equal(response.jsonBody.token, undefined);
});

test("authenticated request receives a token", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader(), body: { documentId: "doc-1" } }),
		{ config: makeConfig(), now: 1_700_000_000 },
	);

	assert.equal(response.status, 200);
	assert.equal(response.jsonBody.expiresAt, 1_700_003_600);

	const claims = claimsOf(response);
	assert.equal(claims.tenantId, "fluid");
	assert.equal(claims.documentId, "doc-1");
});

test("POST reads tenant and document ids from a JSON body", async () => {
	const response = await handleTokenRequest(
		makeRequest({
			principalHeader: defaultPrincipalHeader(),
			body: { tenantId: "fluid", documentId: "doc-from-body" },
		}),
		{ config: makeConfig() },
	);

	assert.equal(response.status, 200);
	assert.equal(claimsOf(response).documentId, "doc-from-body");
});

test("POST rejects malformed and non-object JSON bodies", async () => {
	for (const request of [
		makeRequest({
			principalHeader: defaultPrincipalHeader(),
			invalidJson: true,
		}),
		makeRequest({
			principalHeader: defaultPrincipalHeader(),
			body: [],
		}),
	]) {
		const response = await handleTokenRequest(request, { config: makeConfig() });
		assert.equal(response.status, 400);
	}
});

test("POST rejects non-string identifiers instead of coercing them", async () => {
	for (const body of [{ tenantId: 123 }, { documentId: 123 }, { documentId: {} }]) {
		const response = await handleTokenRequest(
			makeRequest({
				principalHeader: defaultPrincipalHeader(),
				body,
			}),
			{ config: makeConfig() },
		);
		assert.equal(response.status, 400);
	}
});

test("all responses prevent token caching and content sniffing", async () => {
	for (const request of [
		makeRequest({ principalHeader: defaultPrincipalHeader(), body: {} }),
		makeRequest(),
	]) {
		const response = await handleTokenRequest(request, { config: makeConfig() });
		assert.equal(response.headers["Cache-Control"], "no-store, private");
		assert.equal(response.headers.Pragma, "no-cache");
		assert.equal(response.headers.Expires, "0");
		assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
	}
});

test("token identity comes from the verified principal, never the request body", async () => {
	// This is the defect the earlier token-function prototype had: it read the user id and name
	// from caller input, so any caller could mint a token impersonating anyone.
	const response = await handleTokenRequest(
		makeRequest({
			principalHeader: defaultPrincipalHeader({ oid: "real-user", name: "Real User" }),
			body: { id: "spoofed-user", name: "Spoofed User", userId: "spoofed-user" },
		}),
		{ config: makeConfig() },
	);

	const claims = claimsOf(response);
	assert.equal(claims.user.id, "real-user");
	assert.equal(claims.user.name, "Real User");
	assert.ok(!JSON.stringify(claims).includes("spoofed"));
});

test("request for an unserved tenant is rejected with 403", async () => {
	const response = await handleTokenRequest(
		makeRequest({
			principalHeader: defaultPrincipalHeader(),
			body: { tenantId: "someone-elses-tenant" },
		}),
		{ config: makeConfig() },
	);

	assert.equal(response.status, 403);
});

test("identity from a foreign Entra tenant is rejected with 403", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader({ tid: "other-directory" }) }),
		{ config: makeConfig({ entraTenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47" }) },
	);

	assert.equal(response.status, 403);
});

test("tenant defaults to the configured tenant when the body omits it", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader() }),
		{ config: makeConfig({ defaultTenantId: "fluid" }) },
	);

	assert.equal(claimsOf(response).tenantId, "fluid");
});

test("missing documentId yields a tenant-scoped token", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader() }),
		{ config: makeConfig() },
	);

	assert.equal(response.status, 200);
	assert.equal(claimsOf(response).documentId, "");
});

test("malformed ids are rejected with 400", async () => {
	for (const body of [{ tenantId: "bad tenant!" }, { documentId: "../../etc/passwd" }]) {
		const response = await handleTokenRequest(
			makeRequest({ principalHeader: defaultPrincipalHeader(), body }),
			{ config: makeConfig() },
		);
		assert.equal(response.status, 400, `expected ${JSON.stringify(body)} to be rejected`);
	}
});

test("an over-long id is rejected", async () => {
	const response = await handleTokenRequest(
		makeRequest({
			principalHeader: defaultPrincipalHeader(),
			body: { documentId: "d".repeat(256) },
		}),
		{ config: makeConfig() },
	);
	assert.equal(response.status, 400);
});

test("scopes come from the authorization decision", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader() }),
		{
			config: makeConfig(),
			authorizeFn: () => ({ allowed: true, scopes: READ_ONLY_SCOPES }),
		},
	);

	assert.deepEqual(claimsOf(response).scopes, READ_ONLY_SCOPES);
});

test("an authorization decision granting no scopes is treated as a denial", async () => {
	// riddler rejects a token with empty scopes anyway; failing here keeps the reason honest
	// and avoids handing the client a token that cannot work.
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader() }),
		{ config: makeConfig(), authorizeFn: () => ({ allowed: true, scopes: [] }) },
	);

	assert.equal(response.status, 403);
});

test("token lifetime follows configuration", async () => {
	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader() }),
		{
			config: makeConfig({ tokenLifetimeSec: 600, maxTokenLifetimeSec: 3600 }),
			now: 1_700_000_000,
		},
	);

	const claims = claimsOf(response);
	assert.equal(claims.exp - claims.iat, 600);
});

test("the local-dev bypass issues a token only when explicitly enabled", async () => {
	const response = await handleTokenRequest(makeRequest(), {
		config: makeConfig({ allowInsecureLocalDev: true }),
	});

	assert.equal(response.status, 200);
	assert.equal(claimsOf(response).user.id, "local-dev");
});

test("a multi-tenant deployment signs with the requested tenant's own key", async () => {
	// The bug this pins: signing every tenant's token with one key produced a confident 200
	// carrying a token riddler then rejected, with nothing to explain why.
	const fluidKey = "1111111111111111111111111111111111111111111111111111111111111111";
	const marketingKey = "2222222222222222222222222222222222222222222222222222222222222222";
	const config = makeConfig({
		allowedTenants: ["fluid", "marketing"],
	});
	config.tenantKeys = { fluid: fluidKey, marketing: marketingKey };

	const response = await handleTokenRequest(
		makeRequest({
			principalHeader: defaultPrincipalHeader(),
			body: { tenantId: "marketing", documentId: "doc-1" },
		}),
		{ config },
	);

	assert.equal(response.status, 200);

	const [header, payload, signature] = response.jsonBody.token.split(".");
	const expected = crypto
		.createHmac("sha256", marketingKey)
		.update(`${header}.${payload}`)
		.digest("base64url");
	assert.equal(signature, expected, "token must be signed with the marketing key");

	const wrong = crypto
		.createHmac("sha256", fluidKey)
		.update(`${header}.${payload}`)
		.digest("base64url");
	assert.notEqual(signature, wrong);
});

test("a tenant with no configured key is refused rather than signed with another key", async () => {
	const config = makeConfig({ allowedTenants: ["fluid", "orphan"] });

	const response = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader(), body: { tenantId: "orphan" } }),
		{ config },
	);

	assert.equal(response.status, 403);
	assert.equal(response.jsonBody.token, undefined);
});

test("the configured policy is applied without being passed in", async () => {
	// Pins the wiring from configuration to the policy actually used: with tenant-scoped
	// selected, a user holding no role for the tenant is refused rather than granted.
	const config = makeConfig({ authorizationPolicy: "tenant-scoped" });

	const denied = await handleTokenRequest(
		makeRequest({ principalHeader: defaultPrincipalHeader(), body: { documentId: "doc-1" } }),
		{ config },
	);
	assert.equal(denied.status, 403);

	const allowed = await handleTokenRequest(
		makeRequest({
			principalHeader: defaultPrincipalHeader({ roles: ["Fluid.fluid.Writer"] }),
			body: { documentId: "doc-1" },
		}),
		{ config },
	);
	assert.equal(allowed.status, 200);
});

test("denials and errors never leak a token", async () => {
	const cases = [
		[makeRequest(), makeConfig()],
		[makeRequest({ principalHeader: defaultPrincipalHeader(), body: { tenantId: "nope" } }), makeConfig()],
		[makeRequest({ principalHeader: defaultPrincipalHeader(), body: { documentId: "b ad" } }), makeConfig()],
	];

	for (const [request, config] of cases) {
		const response = await handleTokenRequest(request, { config });
		assert.ok(response.status >= 400);
		assert.equal(response.jsonBody.token, undefined);
		assert.ok(!JSON.stringify(response.jsonBody).includes(config.tenantKeys.fluid));
	}
});
