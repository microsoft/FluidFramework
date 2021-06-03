/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Gets the length of the query string portion of a url.
 * @param url The full url
 */
function getQueryStringLength(url: string): number {
    const queryParamStart = url.indexOf("?");

    if (queryParamStart === -1) {
        return 0;
    }

    return url.length - queryParamStart - 1;
}

// eslint-disable-next-line max-len
export function getUrlAndHeadersWithAuth(url: string, token: string | null): { url: string, headers: { [index: string]: string } } {
    if (!token || token.length === 0) {
        return { url, headers: {} };
    }

    const queryParamStart = url.indexOf("?");

    // Determine if we need to add ?, &, or nothing (if the url ends with ?)
    let tokenQueryParam = queryParamStart === -1 ? "?" : (queryParamStart !== url.length - 1 ? `&` : "");

    const tokenIsQueryParam = token.startsWith("?");
    if (tokenIsQueryParam) {
        // The token itself is a query param
        tokenQueryParam += token.substring(1);
    } else {
        tokenQueryParam += `access_token=${encodeURIComponent(token)}`;
    }

    // ODSP APIs have a limitation that the query string cannot exceed 2048 characters.
    // We try to stick the access token in the URL to make it a simple XHR request and avoid an options call.
    // If the query string exceeds 2048, we have to fall back to sending the access token as a header, which
    // has a negative performance implication as it adds a performance overhead.
    if (tokenIsQueryParam || getQueryStringLength(url + tokenQueryParam) <= 2048) {
        return {
            headers: {},
            url: url + tokenQueryParam,
        };
    }

    return {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        url,
    };
}
