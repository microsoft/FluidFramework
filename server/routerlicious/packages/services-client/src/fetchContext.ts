/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FetchFn } from "./fetchTypes";

let globalFetchFn: FetchFn = globalThis.fetch.bind(globalThis);

/**
 * Sets the global fetch function used by `BasicRestWrapper` by default.
 * Call this at startup to wrap fetch with abort signal support or other middleware.
 * @internal
 */
export function setGlobalFetchFn(fn: FetchFn): void {
	globalFetchFn = fn;
}

/**
 * Returns the global fetch function. Used by `BasicRestWrapper` as the default.
 * @internal
 */
export function getGlobalFetchFn(): FetchFn {
	return globalFetchFn;
}
