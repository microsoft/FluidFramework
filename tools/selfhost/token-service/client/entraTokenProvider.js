/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Client-side token provider for the self-hosted Fluid stack.
 *
 * Why this exists: `AzureFunctionTokenProvider` from `@azure/fluid-relay` cannot acquire and
 * present the Entra access token required by Easy Auth. This provider does both.
 *
 * `ITokenProvider` is only two methods, so implementing it directly is straightforward.
 *
 * Usage with MSAL:
 *
 *   import { PublicClientApplication } from "@azure/msal-browser";
 *
 *   const msal = new PublicClientApplication({
 *       auth: {
 *           clientId: "<client app registration id>",
 *           authority: "https://login.microsoftonline.com/<your entra tenant id>",
 *       },
 *   });
 *   await msal.initialize();
 *
 *   const provider = new EntraTokenProvider(
 *       "https://<your-function-app>.azurewebsites.net/api/token",
 *       async () => {
 *           const account = msal.getAllAccounts()[0] ?? (await msal.loginPopup()).account;
 *           const result = await msal.acquireTokenSilent({
 *               account,
 *               // The scope exposed by the token service's App Registration.
 *               scopes: ["api://<token service app id>/Fluid.Token.Issue"],
 *           });
 *           return result.accessToken;
 *       },
 *   );
 *
 *   const client = new AzureClient({
 *       connection: {
 *           type: "remote",
 *           tenantId: "fluid",
 *           tokenProvider: provider,
 *           endpoint: "https://<your alfred endpoint>",
 *       },
 *   });
 */

/**
 * Refresh this many seconds before a token actually expires, so a long-lived session renews
 * during normal operation rather than after a request has already failed.
 */
const REFRESH_SKEW_SEC = 300;

export class EntraTokenProvider {
	/**
	 * @param {string} tokenServiceUrl - URL of the deployed token endpoint.
	 * @param {() => Promise<string>} getAccessToken - Returns a current Entra access token for
	 *   the token service's API scope. Kept as a callback so this class works with any identity
	 *   library rather than depending on a particular MSAL version.
	 */
	constructor(tokenServiceUrl, getAccessToken) {
		this.tokenServiceUrl = tokenServiceUrl;
		this.getAccessToken = getAccessToken;
		/** @type {Map<string, { jwt: string, expiresAt: number }>} */
		this.cache = new Map();
	}

	async fetchOrdererToken(tenantId, documentId, refresh) {
		return this.getToken(tenantId, documentId, refresh);
	}

	async fetchStorageToken(tenantId, documentId, refresh) {
		return this.getToken(tenantId, documentId, refresh);
	}

	/**
	 * @returns {Promise<{ jwt: string, fromCache: boolean }>}
	 */
	async getToken(tenantId, documentId, refresh) {
		const cacheKey = `${tenantId}/${documentId ?? ""}`;
		const now = Math.round(Date.now() / 1000);

		// A tenant-scoped token (no document id) is what the driver presents to alfred's
		// create-document route, POST /documents/:tenantId. That is the only route configured
		// with `requireDocumentId: false, ensureSingleUseToken: true` -- every other route is the
		// mirror image -- so "has no document id" and "is single-use" describe the same tokens,
		// which is why this predicate is exactly `Boolean(documentId)`.
		//
		// Enforcement caches the RAW TOKEN STRING and rejects a repeat with
		// "Access token has already been used." (403). A second token bearing the same claims is
		// fine; only the identical string fails. Caching here would hand the same string back for
		// every document-less request, since they all share the cacheKey below -- so the first use
		// would succeed and the next would 403 mid-attach. This relies on the token service giving
		// every mint a unique jti; without that, two mints in the same second would serialize
		// identically and trip the same check even with caching off.
		const cacheable = Boolean(documentId);

		// `refresh` is set by the driver after a request failed authorization, so a cached token
		// must never be returned in that case even if it still looks valid.
		if (cacheable && !refresh) {
			const cached = this.cache.get(cacheKey);
			if (cached && cached.expiresAt - REFRESH_SKEW_SEC > now) {
				return { jwt: cached.jwt, fromCache: true };
			}
		}

		const accessToken = await this.getAccessToken();

		const url = new URL(this.tokenServiceUrl);

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tenantId, ...(documentId ? { documentId } : {}) }),
		});

		if (!response.ok) {
			const detail = await response.text().catch(() => "");
			throw new Error(
				`Token request failed with ${response.status} ${response.statusText}. ${detail}`.trim(),
			);
		}

		const { token, expiresAt } = await response.json();
		if (cacheable) {
			this.cache.set(cacheKey, { jwt: token, expiresAt });
		}

		return { jwt: token, fromCache: false };
	}
}
