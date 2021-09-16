/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    default as nodeFetch,
    RequestInfo as FetchRequestInfo,
    RequestInit as FetchRequestInit,
} from "node-fetch";

// The only purpose of this helper is to work around the slight misalignments between the
// Browser's fetch API and the 'node-fetch' package by wrapping the call to the 'node-fetch' API
// in the browser's types from 'lib.dom.d.ts'.
export const fetch = async (request: RequestInfo, config?: RequestInit): Promise<Response> => {
    const requestInit: RequestInit = config ?? {};
    if (process.env.FLUID_TEST_UID !== undefined) {
        if (requestInit.headers === undefined) {
            requestInit.headers = {};
        }

        requestInit.headers["User-Agent"] = `Fluid Scale Test ${process.env.FLUID_TEST_UID}`;
    }

    return nodeFetch(request as FetchRequestInfo, requestInit as FetchRequestInit) as unknown as Response;
};
