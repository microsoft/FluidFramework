/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

export function getUrlAndHeadersWithAuth(
	url: string,
	token: string,
	forceAccessTokenViaAuthorizationHeader: boolean,
): { url: string; headers: { [index: string]: string } } {
	assert(token.length > 0, "should be token");

	if (!forceAccessTokenViaAuthorizationHeader) {
		// Pass access token via query string: this will make request be treated as 'simple' request
		// which does not require OPTIONS call as part of CORS check.
		const urlWithAccessTokenInQueryString = new URL(url);
		// IMPORTANT: Do not apply encodeURIComponent to token, param value is automatically encoded
		// when set via URLSearchParams class
		urlWithAccessTokenInQueryString.searchParams.set("access_token", token);
		// ODSP APIs have a limitation that the query string cannot exceed 2048 characters.
		// If the query string exceeds 2048, we have to fall back to sending the access token as a header, which
		// has a negative performance implication as it adds a performance overhead.
		// NOTE: URL.search.length value includes '?' symbol and it is unclear whether backend logic which enforces
		// query length limit accounts for it. This logic errs on side of caution and includes that key in overall
		// query length.
		if (urlWithAccessTokenInQueryString.search.length <= 2048) {
			return {
				headers: {},
				url: urlWithAccessTokenInQueryString.href,
			};
		}
	}

	return {
		headers: {
			Authorization: `Bearer ${token}`,
		},
		url,
	};
}
