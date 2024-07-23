/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type QueryStringType = Record<string, string | number | boolean>;

/**
 * Generates URL object from the given string request url and query parameters.
 * @param url - URL to which query params should be appended. Can include base/default query params.
 * @param queryParams - Query parameters to append. Will override any query params in url.
 */
export function addOrUpdateQueryParams(url: URL | string, queryParams: QueryStringType): URL {
	// Initialize urlSearchParams with query params from the base URL itself
	const outputUrl = new URL(url);
	const updatedSearchParams = outputUrl.searchParams;
	for (const [key, value] of Object.entries(queryParams)) {
		// Add/override search params from query params
		updatedSearchParams.set(key, encodeURIComponent(value));
	}
	outputUrl.search = updatedSearchParams.toString();
	return outputUrl;
}
