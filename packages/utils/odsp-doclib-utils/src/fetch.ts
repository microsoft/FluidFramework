/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-extraneous-dependencies
import fetch from "isomorphic-fetch";

// The only purpose of this helper is to work around the slight misalignments between the
// Browser's fetch API and the 'node-fetch' package by wrapping the call to the 'node-fetch' API
// in the browser's types from 'lib.dom.d.ts'.
export const customFetch = async (request: RequestInfo, config?: RequestInit): Promise<Response> =>
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	fetch(request, config);
