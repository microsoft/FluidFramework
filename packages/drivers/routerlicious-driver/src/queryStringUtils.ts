export type QueryStringType = Record<string, string | number | boolean>;

/**
 * Generates query string from the given query parameters.
 * @param queryParams - Query parameters from which to create a query.
 * @param url - URL to which query params should be appended
 */
export function buildQueryString(queryParams: QueryStringType, url?: string): string {
	let queryString = "";
	for (const key of Object.keys(queryParams)) {
		if (queryParams[key] !== undefined) {
			const startChar = queryString === "" ? "?" : "&";
			queryString += `${startChar}${key}=${encodeURIComponent(queryParams[key])}`;
		}
	}
	if (url) {
		// remove existing query params before appending
		return `${url.split("?")[0]}${queryString}`;
	}
	return queryString;
}
