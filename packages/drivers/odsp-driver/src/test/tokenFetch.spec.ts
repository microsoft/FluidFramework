/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import {
	isTokenFromCache,
	tokenFromResponse,
	authHeaderFromTokenResponse,
} from "@fluidframework/odsp-driver-definitions/internal";

describe("tokenFromResponse", () => {
	it("returns token verbatim when token value is passed as a string", async () => {
		const token = "fake token";
		const result = tokenFromResponse(token);
		assert.equal(result, token);
	});

	it("returns token extracted from TokenResponse when token value is passed as object", async () => {
		const tokenResponse = { token: "fake token", fromCache: false };
		const result = tokenFromResponse(tokenResponse);
		assert.equal(result, tokenResponse.token);
	});

	it("returns null when token value is passed as null", async () => {
		const result = tokenFromResponse(null);
		assert.equal(result, null);
	});
});

describe("authHeaderFromTokenResponse", () => {
	it("returns token prefixed with 'Bearer' when token value is passed as a string", async () => {
		const token = "fake token";
		const result = authHeaderFromTokenResponse(token);
		assert.equal(result, `Bearer ${token}`);
	});
	it("returns authorizationHeader value from TokenResponse when token value is passed as object", async () => {
		const tokenResponse = { token: "fake token", authorizationHeader: "SCHEME token token" };
		const result = authHeaderFromTokenResponse(tokenResponse);
		assert.equal(result, tokenResponse.authorizationHeader);
	});
	it("returns Bearer authorization header when token is defined and authorizationHeader is not", async () => {
		const tokenResponse = { token: "fake token" };
		const result = authHeaderFromTokenResponse(tokenResponse);
		assert.equal(result, "Bearer fake token");
	});
});

describe("isTokenFromCache", () => {
	it("returns undefined when token value is passed as a string", async () => {
		const token = "fake token";
		const result = isTokenFromCache(token);
		assert.equal(result, undefined);
	});

	it("returns fromCache value extracted from TokenResponse when token value is passed as object", async () => {
		const tokenResponse = { token: "fake token", fromCache: true };
		const result = isTokenFromCache(tokenResponse);
		assert.equal(result, tokenResponse.fromCache);
	});

	it("returns undefined when token value is passed as null", async () => {
		const result = isTokenFromCache(null);
		assert.equal(result, undefined);
	});
});
