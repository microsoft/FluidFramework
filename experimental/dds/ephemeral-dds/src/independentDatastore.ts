/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ValueElement } from "./internalTypes.js";
import type { ClientId, IndependentDatastoreHandle, RoundTrippable } from "./types.js";

// type IndependentDatastoreSchemaNode<
// 	TValue = unknown,
// 	TSerialized extends Serializable<TValue> = Serializable<TValue>,
// > = TSerialized extends Serializable<TValue> ? TValue : never;

/**
 * @internal
 */
export interface IndependentDatastoreSchema {
	// This type is very odd. It may not be doing much and may
	// need to be replaced with IndependentDirectory schema pattern
	// similar to what is commented out.
	// For now, it seems to work.
	[Path: string]: ReturnType<<TValue>() => TValue>;
	// [Path: string]: IndependentDatastoreSchemaNode;
}

/**
 * @internal
 */
export interface IndependentDatastore<
	TSchema extends IndependentDatastoreSchema,
	TPath extends keyof TSchema & string = keyof TSchema & string,
> {
	localUpdate(path: TPath, forceBroadcast: boolean): void;
	update(
		path: TPath,
		clientId: ClientId,
		rev: number,
		value: RoundTrippable<TSchema[TPath]>,
	): void;
	knownValues(path: TPath): {
		self: ClientId | undefined;
		states: ValueElement<TSchema[TPath]>;
	};
}

/**
 * @internal
 */
export function handleFromDatastore<
	// Constraining TSchema would be great, but it seems nested types (at least with undefined) cause trouble.
	// TSchema as `any` still provides some type safety.
	// TSchema extends IndependentDatastoreSchema,
	TPath extends string /* & keyof TSchema */,
	TValue,
>(datastore: IndependentDatastore<any, TPath>): IndependentDatastoreHandle<TPath, TValue> {
	return datastore as unknown as IndependentDatastoreHandle<TPath, TValue>;
}

/**
 * @internal
 */
export function datastoreFromHandle<TPath extends string, TValue>(
	handle: IndependentDatastoreHandle<TPath, TValue>,
): IndependentDatastore<Record<TPath, TValue>> {
	return handle as unknown as IndependentDatastore<Record<TPath, TValue>>;
}
