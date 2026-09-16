/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * End-user identity, derived only from what Easy Auth verified.
 *
 * Easy Auth validates the incoming `Authorization: Bearer` token before any of this code runs,
 * then injects the verified principal as `x-ms-client-principal` (base64 JSON). The platform
 * strips any client-supplied copy of that header, so its presence means the request carries a
 * signature-checked Entra token.
 *
 * This module never reads identity from request input. That was the core
 * defect in the earlier `token-function` prototype: it trusted caller-supplied user fields, so
 * any caller could mint a token claiming to be anyone.
 */

const PRINCIPAL_HEADER = "x-ms-client-principal";

const CLAIM_OID = "http://schemas.microsoft.com/identity/claims/objectidentifier";
const CLAIM_TID = "http://schemas.microsoft.com/identity/claims/tenantid";
const CLAIM_NAME = "name";
const CLAIM_PREFERRED_USERNAME = "preferred_username";
const CLAIM_ROLES = "roles";
const CLAIM_SCP = "http://schemas.microsoft.com/identity/claims/scope";

class IdentityError extends Error {
	constructor(message, status = 401) {
		super(message);
		this.status = status;
	}
}

function claimValue(claims, ...types) {
	for (const type of types) {
		const match = claims.find((claim) => claim.typ === type);
		if (match?.val) {
			return match.val;
		}
	}
	return undefined;
}

function claimValues(claims, type) {
	return claims.filter((claim) => claim.typ === type && claim.val).map((claim) => claim.val);
}

function readHeader(headers, name) {
	if (!headers) {
		return undefined;
	}
	if (typeof headers.get === "function") {
		return headers.get(name) ?? undefined;
	}
	const found = Object.keys(headers).find((key) => key.toLowerCase() === name);
	return found ? headers[found] : undefined;
}

/**
 * Extract the verified principal from request headers.
 *
 * Fails closed: a missing header means Easy Auth is not in front of this function. That would
 * otherwise turn the endpoint into an anonymous minting service, which is the worst possible
 * outcome for this component, so it is a hard 401 rather than a fallback path.
 *
 * @param headers - Header bag exposing `get(name)`, or a plain object.
 * @param options - `{ entraTenantId, allowInsecureLocalDev }`.
 * @throws IdentityError carrying a `status` of 401 or 403.
 */
function extractPrincipal(headers, options = {}) {
	const { entraTenantId, allowInsecureLocalDev = false } = options;

	const raw = readHeader(headers, PRINCIPAL_HEADER);

	if (!raw) {
		if (allowInsecureLocalDev) {
			return {
				id: "local-dev",
				name: "Local Development User",
				tenantId: undefined,
				roles: [],
				scopes: [],
				insecureLocalDev: true,
			};
		}
		throw new IdentityError(
			"Request carries no verified identity. Easy Auth must be enabled and configured to " +
				"require authentication for this Function App.",
		);
	}

	let principal;
	try {
		principal = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
	} catch {
		throw new IdentityError("Client principal header could not be decoded.");
	}

	const claims = Array.isArray(principal?.claims) ? principal.claims : [];
	if (claims.length === 0) {
		throw new IdentityError("Client principal contains no claims.");
	}

	// The object id is the only stable, non-reassignable user identifier. Email and UPN can both
	// be changed or reused, so neither is safe as durable identity for document attribution.
	const id = claimValue(claims, CLAIM_OID, "oid", "sub");
	if (!id) {
		throw new IdentityError("Client principal has no object identifier claim.");
	}

	// Easy Auth does not always surface the tenant id, and which claim name it uses varies with
	// the token version and the app's claims-mapping settings. Treating an absent claim as a
	// mismatch rejects legitimate sign-ins, which is what a bodiless 403 straight after a
	// successful Entra login looks like.
	//
	// Nothing is lost by allowing it: Easy Auth pins `openIdIssuer` to one directory and rejects
	// any token not issued by it, which is a stronger guarantee than comparing this claim. The
	// comparison stays as defence in depth for when the claim is present.
	const tenantId = claimValue(claims, CLAIM_TID, "tid");
	if (entraTenantId && tenantId !== undefined && tenantId !== entraTenantId) {
		throw new IdentityError(
			`Identity is from Entra tenant "${tenantId}", which is not the configured tenant.`,
			403,
		);
	}

	return {
		id,
		name: claimValue(claims, CLAIM_NAME, CLAIM_PREFERRED_USERNAME, "upn", "email") ?? id,
		tenantId,
		roles: claimValues(claims, CLAIM_ROLES),
		scopes: (claimValue(claims, CLAIM_SCP, "scp") ?? "").split(" ").filter(Boolean),
		insecureLocalDev: false,
	};
}

module.exports = {
	CLAIM_ROLES,
	IdentityError,
	PRINCIPAL_HEADER,
	extractPrincipal,
	readHeader,
};
