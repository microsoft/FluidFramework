/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { getUrlAndHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";

describe("getUrlAndHeadersWithAuth", () => {
	const baseUrl = "https://contoso.sharepoint.com/_api/v2.1/drives/driveId/items/itemId/opstream";
	const urlWithoutParams = new URL(baseUrl);
	const urlWithSingleParam = new URL(`${baseUrl}?someParam=someValue`);
	const urlWithMultipleParams = new URL(`${baseUrl}?param1=value1&param2=value2`);
	// decrement by 1 to account for '?' character included in query string
	const maxTokenLength = 2048 - "access_token=".length - 1;
	const shortToken = generateToken(10);

	function generateToken(length: number): string {
		return "a".repeat(length);
	}

	it("returns original url if token is null", async () => {
		const { url, headers } = getUrlAndHeadersWithAuth(baseUrl, null);
		assert.strictEqual(url, baseUrl, "Original and returned urls must match");
		assert.deepStrictEqual(headers, {}, "Returned header must be empty");
	});

	it("returns original url if token is empty", async () => {
		const { url, headers } = getUrlAndHeadersWithAuth(baseUrl, "");
		assert.strictEqual(url, baseUrl, "Original and returned urls must match");
		assert.deepStrictEqual(headers, {}, "Returned header must be empty");
	});

	const validateTokenEmbeddedIntoHeaders = (
		originalUrl: URL,
		token: string,
		result: { url: string; headers: { [index: string]: string } },
	): void => {
		const returnedUrl = new URL(result.url);
		assert.strictEqual(
			returnedUrl.searchParams.get("access_token"),
			null,
			"Url must not contain token in query string",
		);
		assert.strictEqual(
			result.headers.Authorization.endsWith(token),
			true,
			"Returned header must contain token",
		);
		assert.strictEqual(
			returnedUrl.href,
			originalUrl.href,
			"Returned url must match original url",
		);
	};

	it("returns headers with token embedded in Authorization header when overall query string exceeds 2048 characters", async () => {
		const longTokenForUrlWithoutParams = generateToken(maxTokenLength + 1);
		validateTokenEmbeddedIntoHeaders(
			urlWithoutParams,
			longTokenForUrlWithoutParams,
			getUrlAndHeadersWithAuth(urlWithoutParams.href, longTokenForUrlWithoutParams),
		);

		const longTokenForUrlWithSingleParam = generateToken(
			maxTokenLength - urlWithSingleParam.search.length + 1,
		);
		validateTokenEmbeddedIntoHeaders(
			urlWithSingleParam,
			longTokenForUrlWithSingleParam,
			getUrlAndHeadersWithAuth(urlWithSingleParam.href, longTokenForUrlWithSingleParam),
		);

		const longTokenForUrlMultipleParams = generateToken(
			maxTokenLength - urlWithMultipleParams.search.length + 1,
		);
		validateTokenEmbeddedIntoHeaders(
			urlWithMultipleParams,
			longTokenForUrlMultipleParams,
			getUrlAndHeadersWithAuth(urlWithMultipleParams.href, longTokenForUrlMultipleParams),
		);
	});

	it("returns headers with token embedded in Authorization header when forced", async () => {
		validateTokenEmbeddedIntoHeaders(
			urlWithoutParams,
			shortToken,
			getUrlAndHeadersWithAuth(urlWithoutParams.href, shortToken),
		);

		validateTokenEmbeddedIntoHeaders(
			urlWithSingleParam,
			shortToken,
			getUrlAndHeadersWithAuth(urlWithSingleParam.href, shortToken),
		);

		validateTokenEmbeddedIntoHeaders(
			urlWithMultipleParams,
			shortToken,
			getUrlAndHeadersWithAuth(urlWithMultipleParams.href, shortToken),
		);
	});
});
