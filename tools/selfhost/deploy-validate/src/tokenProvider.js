/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use strict";

// The default validation mode mirrors token-function/src/functions/token.js's generateToken
// exactly (same claims shape, same HS256 signing), so a locally-signed test token is
// indistinguishable to riddler from one minted by a real token service.

const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

function generateToken(tenantId, key, scopes, documentId, user) {
	const now = Math.round(Date.now() / 1000);
	const claims = {
		documentId: documentId ?? "",
		scopes,
		tenantId,
		user: user ?? { id: crypto.randomUUID() },
		iat: now,
		exp: now + 60 * 60,
		ver: "1.0",
		jti: crypto.randomUUID(),
	};
	// NOTE: `noTimestamp: true` is deliberately NOT used here. It doesn't mean "leave a
	// manually-set iat alone" -- confirmed directly in jsonwebtoken's own sign.js, it
	// unconditionally `delete`s payload.iat regardless of whether one was already set. Without
	// it, jsonwebtoken's own default behavior (`payload.iat = payload.iat || now`) preserves our
	// manually-set value exactly, which is what's actually needed here: the server's
	// validateTokenClaimsExpiration (services-client/src/auth.ts) rejects any token missing iat
	// with "Invalid token expiry" -- confirmed live, this exact bug produced that exact error.
	return jwt.sign(claims, key, { algorithm: "HS256" });
}

/**
 * @param {string} tenantId
 * @param {string} key
 * @returns {import("@fluidframework/azure-client").ITokenProvider}
 */
function buildTokenProvider(tenantId, key) {
	const scopes = ["doc:read", "doc:write", "summary:write"];
	const issue = async (docId) => ({
		jwt: generateToken(tenantId, key, scopes, docId ?? "", { id: "deploy-validate", name: "deploy-validate" }),
	});
	return {
		fetchOrdererToken: (_tenantId, documentId) => issue(documentId),
		fetchStorageToken: (_tenantId, documentId) => issue(documentId),
	};
}

const REFRESH_SKEW_SEC = 300;

class TokenServiceError extends Error {
	constructor(message, { status, statusText, detail, serviceMessage } = {}) {
		super(message);
		this.name = "TokenServiceError";
		this.status = status;
		this.statusText = statusText;
		this.detail = detail;
		this.serviceMessage = serviceMessage;
	}
}

/**
 * Builds a provider that exercises the deployed token service instead of signing locally.
 *
 * @param {string} tokenServiceUrl
 * @param {() => Promise<string>} getAccessToken
 * @param {typeof fetch} fetchFn
 * @returns {import("@fluidframework/azure-client").ITokenProvider}
 */
function buildTokenServiceProvider(
	tokenServiceUrl,
	getAccessToken,
	fetchFn = globalThis.fetch,
) {
	const cache = new Map();

	const issue = async (tenantId, documentId, refresh) => {
		const cacheKey = `${tenantId}/${documentId ?? ""}`;
		const cacheable = Boolean(documentId);
		const now = Math.round(Date.now() / 1000);
		if (cacheable && !refresh) {
			const cached = cache.get(cacheKey);
			if (cached && cached.expiresAt - REFRESH_SKEW_SEC > now) {
				return { jwt: cached.jwt, fromCache: true };
			}
		}

		const accessToken = await getAccessToken();
		const response = await fetchFn(tokenServiceUrl, {
			method: "POST",
			headers: {
				Authorization: "Bearer " + accessToken,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				tenantId,
				...(documentId ? { documentId } : {}),
			}),
		});
		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			let serviceMessage = "";
			try {
				const parsed = JSON.parse(detail);
				serviceMessage =
					typeof parsed.error === "string" ? parsed.error : "";
			} catch {
				// Preserve non-JSON response text in detail for diagnostics.
			}
			throw new TokenServiceError(
				`Token service returned ${response.status} ${response.statusText}. ${detail}`.trim(),
				{
					status: response.status,
					statusText: response.statusText,
					detail,
					serviceMessage,
				},
			);
		}

		const payload = await response.json();
		if (
			typeof payload !== "object" ||
			payload === null ||
			typeof payload.token !== "string" ||
			!Number.isFinite(payload.expiresAt)
		) {
			throw new TokenServiceError(
				"Token service returned an invalid response.",
				{ status: response.status, statusText: response.statusText },
			);
		}
		const result = { jwt: payload.token, fromCache: false };
		if (cacheable) {
			cache.set(cacheKey, {
				jwt: payload.token,
				expiresAt: payload.expiresAt,
			});
		}
		return result;
	};

	return {
		fetchOrdererToken: (tenantId, documentId, refresh) =>
			issue(tenantId, documentId, refresh),
		fetchStorageToken: (tenantId, documentId, refresh) =>
			issue(tenantId, documentId, refresh),
	};
}

module.exports = {
	buildTokenProvider,
	buildTokenServiceProvider,
	generateToken,
	TokenServiceError,
};
