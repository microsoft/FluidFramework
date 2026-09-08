/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/** Shared helpers for building request fixtures. */

/**
 * Build the base64 `x-ms-client-principal` header value that Easy Auth injects.
 *
 * @param claims - Array of `{ typ, val }` claim objects.
 */
function encodePrincipal(claims) {
	return Buffer.from(JSON.stringify({ auth_typ: "aad", claims }), "utf8").toString("base64");
}

const CLAIM_OID = "http://schemas.microsoft.com/identity/claims/objectidentifier";
const CLAIM_TID = "http://schemas.microsoft.com/identity/claims/tenantid";

/**
 * A realistic verified principal for a signed-in Entra user.
 */
function defaultPrincipalHeader({
	oid = "11111111-2222-3333-4444-555555555555",
	name = "Ada Lovelace",
	tid = "72f988bf-86f1-41af-91ab-2d7cd011db47",
	roles = [],
} = {}) {
	const claims = [
		{ typ: CLAIM_OID, val: oid },
		{ typ: CLAIM_TID, val: tid },
		{ typ: "name", val: name },
		{ typ: "preferred_username", val: "ada@example.com" },
		...roles.map((role) => ({ typ: "roles", val: role })),
	];
	return encodePrincipal(claims);
}

/**
 * Minimal request shaped like the Azure Functions v4 `HttpRequest` surface the handler uses.
 */
function makeRequest({ principalHeader, body, invalidJson = false } = {}) {
	const headers = new Map();
	if (principalHeader) {
		headers.set("x-ms-client-principal", principalHeader);
	}
	return {
		method: "POST",
		headers: { get: (name) => headers.get(name.toLowerCase()) },
		json: async () => {
			if (invalidJson) {
				throw new SyntaxError("invalid JSON");
			}
			return body;
		},
	};
}

/** Config with every required field populated, overridable per test. */
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function makeConfig(overrides = {}) {
	const { tenantKey = TEST_KEY, ...rest } = overrides;
	return {
		tenantKeys: { fluid: tenantKey },
		defaultTenantId: "fluid",
		allowedTenants: ["fluid"],
		tokenLifetimeSec: 3600,
		maxTokenLifetimeSec: 3600,
		entraTenantId: undefined,
		allowInsecureLocalDev: false,
		...rest,
	};
}

module.exports = {
	CLAIM_OID,
	TEST_KEY,
	CLAIM_TID,
	defaultPrincipalHeader,
	encodePrincipal,
	makeConfig,
	makeRequest,
};
