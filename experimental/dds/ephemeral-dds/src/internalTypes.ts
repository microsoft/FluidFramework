/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ClientId, RoundTrippable } from "./types.js";

/**
 * @internal
 */
export interface ValueState<TValue> {
	rev: number;
	value: RoundTrippable<TValue>;
}

/**
 * @internal
 */
export interface ValueElement<TValue> {
	[id: string]: ValueState<TValue>;
}

/**
 * @internal
 */
export interface ValueManager<TValue> {
	get value(): ValueState<TValue>;
	update(clientId: ClientId, rev: number, value: RoundTrippable<TValue>): void;
}
