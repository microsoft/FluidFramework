/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Serializable } from "@fluidframework/datastore-definitions";

export type ClientId = string;

// TODO: RoundTrippable needs revised to be the consistent pre and post serialization
//       and get a better name.
export type RoundTrippable<T> = Serializable<T>;

export interface StateData<T> {
	rev: number;
	value: RoundTrippable<T>;
}

export interface StateElement<T> {
	[id: string]: StateData<T>;
}

export interface StateElementDirectory<T> {
	[id: string]: { [clientId: ClientId]: StateData<T> };
	// Version with local packed in is convenient for directory, but not for join broadcast to serialize simply.
	// [id: string]: {
	// 	local: StateData<T>;
	// 	all: { [clientId: ClientId]: StateData<T> };
	// };
}

// interface StateManagerBase<T> {
// 	stateBlock(): StateElement<T>;
// 	stateBlockOfAll(): StateElementDirectory<T>;
// }

export interface StateManager<T> /* extends StateManagerBase<T> */ {
	connectToDatastore(directory: IndependentDatastore<{ [path: string]: T }>): void;

	get state(): RoundTrippable<T>;
	// set state(value: RoundTrippable<T>);
	update(clientId: ClientId, rev: number, value: RoundTrippable<T>): void;
}

export interface IndependentDatastore<T> {
	update(path: keyof T, clientId: ClientId, rev: number, value: RoundTrippable<T[keyof T]>): void;
}
