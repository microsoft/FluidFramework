/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	RequestInfo as FetchRequestInfo,
	RequestInit as FetchRequestInit,
	default as nodeFetch,
} from "node-fetch";

// The only purpose of this helper is to work around the slight misalignments between the
// Browser's fetch API and the 'node-fetch' package by wrapping the call to the 'node-fetch' API
// in the browser's types from 'lib.dom.d.ts'.
export const fetch = async (request: RequestInfo, config?: RequestInit): Promise<Response> =>
	nodeFetch(request as FetchRequestInfo, config as FetchRequestInit) as unknown as Response;
