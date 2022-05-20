/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISnapshotOptions } from "@fluidframework/odsp-driver-definitions";

/**
 * Generates query string from the given query parameters.
 * @param queryParams - Query parameters from which to create a query.
 */
export function getQueryString(queryParams: { [key: string]: string | number; } | ISnapshotOptions): string {
    let queryString = "";
    for (const key of Object.keys(queryParams)) {
        if (queryParams[key] !== undefined) {
            const startChar = queryString === "" ? "?" : "&";
            queryString += `${startChar}${key}=${encodeURIComponent(queryParams[key])}`;
        }
    }

    return queryString;
}
