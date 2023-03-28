/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { tokenFromResponse, isTokenFromCache } from "@fluidframework/odsp-driver-definitions";

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
