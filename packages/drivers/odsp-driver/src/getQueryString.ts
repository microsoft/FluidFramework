/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Generates query string from the given query parameters.
 * @param queryParams - Query parameters from which to create a query.
 */
export function getQueryString(queryParams: { [key: string]: string }): string {
    let queryString = "";
    for (const key of Object.keys(queryParams)) {
        const startChar = queryString === "" ? "?" : "&";
        queryString += queryParams[key] ? `${startChar}${key}=${encodeURIComponent(queryParams[key])}` : "";
    }

    return queryString;
}
