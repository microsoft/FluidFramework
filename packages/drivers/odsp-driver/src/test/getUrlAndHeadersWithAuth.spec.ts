/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { getHeadersWithAuth } from "../getUrlAndHeadersWithAuth.js";

describe("getHeadersWithAuth", () => {
	const baseUrl =
		"https://contoso.sharepoint.com/_api/v2.1/drives/driveId/items/itemId/opstream";
	const urlWithSingleParam = new URL(`${baseUrl}?someParam=someValue`);
	const urlWithMultipleParams = new URL(`${baseUrl}?param1=value1&param2=value2`);
	// decrement by 1 to account for '?' character included in query string
	const maxTokenLength = 2048 - "access_token=".length - 1;

	function generateToken(length: number): string {
		return "a".repeat(length);
	}

	const validateTokenEmbeddedIntoHeaders = (
		token: string,
		result: { [index: string]: string },
	): void => {
		assert.strictEqual(
			result.Authorization?.endsWith(token),
			true,
			"Returned header must contain token",
		);
	};

	it("returns headers with token embedded in Authorization header when overall query string exceeds 2048 characters", async () => {
		const longTokenForUrlWithoutParams = generateToken(maxTokenLength + 1);
		validateTokenEmbeddedIntoHeaders(
			longTokenForUrlWithoutParams,
			getHeadersWithAuth(longTokenForUrlWithoutParams),
		);

		const longTokenForUrlWithSingleParam = generateToken(
			maxTokenLength - urlWithSingleParam.search.length + 1,
		);
		validateTokenEmbeddedIntoHeaders(
			longTokenForUrlWithSingleParam,
			getHeadersWithAuth(longTokenForUrlWithSingleParam),
		);

		const longTokenForUrlMultipleParams = generateToken(
			maxTokenLength - urlWithMultipleParams.search.length + 1,
		);
		validateTokenEmbeddedIntoHeaders(
			longTokenForUrlMultipleParams,
			getHeadersWithAuth(longTokenForUrlMultipleParams),
		);
	});
});
