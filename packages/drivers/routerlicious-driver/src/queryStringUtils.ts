export type QueryStringType = Record<string, string | number | boolean>;

/**
 * Generates URL string from the given URL and query parameters.
 * @param url - URL to which query params should be appended. Can include base/default query params.
 * @param queryParams - Query parameters from which to create a query. Will override any query params in url.
 */
export function buildUrlWithQueryString(
	url: URL | string,
	queryParams: QueryStringType,
): string {
	// Initialize urlSearchParams with query params from the base URL itself
	const outputUrl = new URL(url);
	const updatedSearchParams = outputUrl.searchParams;
	for (const [key, value] of Object.entries(queryParams)) {
		// Add/override search params from query params
		updatedSearchParams.set(key, encodeURIComponent(value));
	}
	outputUrl.search = updatedSearchParams.toString();
	return outputUrl.href;
}
