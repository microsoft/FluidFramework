/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

/**
 * Request handling, kept free of any Azure Functions types so it can be tested directly.
 * `src/functions/token.js` is the thin adapter that binds this to the Functions runtime.
 */

const { IdentityError, extractPrincipal } = require("./identity");
const { selectPolicy } = require("./authorize");
const { mintToken } = require("./mint");

/** Tenant and document ids appear in URLs and storage paths, so keep them to a safe charset. */
const ID_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;
const RESPONSE_HEADERS = {
	"Cache-Control": "no-store, private",
	Pragma: "no-cache",
	Expires: "0",
	"X-Content-Type-Options": "nosniff",
	"Content-Type": "application/json",
};

async function readInputs(request) {
	let body;
	try {
		body = typeof request.json === "function" ? await request.json() : request.body;
	} catch {
		return { error: "Request body must be valid JSON." };
	}
	if (body === undefined || body === null) {
		body = {};
	}
	if (typeof body !== "object" || Array.isArray(body)) {
		return { error: "Request body must be a JSON object." };
	}
	return { tenantId: body.tenantId, documentId: body.documentId };
}

/**
 * Handle a token request.
 *
 * @param request - Request with headers and a JSON body.
 * @param deps - `{ config, authorizeFn, now, log }`. `authorizeFn` and `now` are injectable
 *   for tests; both default to the production implementations.
 * @returns `{ status, headers, jsonBody }`.
 */
async function handleTokenRequest(request, deps) {
	const {
		config,
		authorizeFn = selectPolicy(config.authorizationPolicy ?? "default"),
		now,
		log = { warn() {}, info() {} },
	} = deps;

	let principal;
	try {
		principal = extractPrincipal(request.headers, {
			entraTenantId: config.entraTenantId,
			allowInsecureLocalDev: config.allowInsecureLocalDev,
		});
	} catch (error) {
		if (error instanceof IdentityError) {
			log.warn(`Token request rejected: ${error.message}`);
			return errorResponse(error.status, error.message);
		}
		throw error;
	}

	if (principal.insecureLocalDev) {
		log.warn(
			"Serving a token to an unauthenticated caller because FLUID_ALLOW_INSECURE_LOCAL_DEV " +
				"is set. This setting is for local development only.",
		);
	}

	const inputs = await readInputs(request);
	if (inputs.error) {
		return errorResponse(400, inputs.error);
	}

	const tenantId =
		inputs.tenantId === undefined || inputs.tenantId === ""
			? config.defaultTenantId
			: inputs.tenantId;
	const documentId =
		inputs.documentId === undefined || inputs.documentId === "" ? "" : inputs.documentId;

	if (typeof tenantId !== "string" || !ID_PATTERN.test(tenantId)) {
		return errorResponse(400, "Invalid tenantId.");
	}
	if (typeof documentId !== "string" || (documentId !== "" && !ID_PATTERN.test(documentId))) {
		return errorResponse(400, "Invalid documentId.");
	}

	const signingKey = config.tenantKeys[tenantId];
	if (!config.allowedTenants.includes(tenantId) || !signingKey) {
		log.warn(`No signing key configured for tenant ${tenantId}.`);
		return errorResponse(403, `Tenant "${tenantId}" is not served by this token service.`);
	}

	// Awaited so a custom policy can look the document up in a database. Per-document
	// authorization is the most likely customisation, and it is almost always async.
	const decision = await authorizeFn({ principal, tenantId, documentId, config });
	if (!decision.allowed) {
		log.warn(
			`Authorization denied for user ${principal.id} on tenant ${tenantId}: ${decision.reason}`,
		);
		return errorResponse(403, decision.reason ?? "Access denied.");
	}
	if (!Array.isArray(decision.scopes) || decision.scopes.length === 0) {
		log.warn(`Authorization returned no scopes for user ${principal.id}.`);
		return errorResponse(403, "Access denied.");
	}

	const issuedAt = now ?? Math.round(Date.now() / 1000);
	const token = mintToken(
		{
			tenantId,
			documentId,
			// Only the verified identity reaches the token. Nothing the caller sent is echoed here.
			user: { id: principal.id, name: principal.name },
			scopes: decision.scopes,
			lifetimeSec: config.tokenLifetimeSec,
			now: issuedAt,
		},
		signingKey,
	);

	log.info(
		`Issued token for user ${principal.id}, tenant ${tenantId}, document ${documentId || "(none)"}.`,
	);

	return {
		status: 200,
		headers: RESPONSE_HEADERS,
		jsonBody: {
			token,
			// Lets a client refresh ahead of expiry instead of waiting for a failed connection.
			expiresAt: issuedAt + config.tokenLifetimeSec,
		},
	};
}

function errorResponse(status, message) {
	return {
		status,
		headers: RESPONSE_HEADERS,
		jsonBody: { error: message },
	};
}

module.exports = {
	ID_PATTERN,
	RESPONSE_HEADERS,
	handleTokenRequest,
	readInputs,
};
