/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientRecord } from "./internalTypes.js";
import type { ClientSessionId, ISessionClient } from "./presence.js";

// type StateDatastoreSchemaNode<
// 	TValue extends InternalTypes.ValueDirectoryOrState<any> = InternalTypes.ValueDirectoryOrState<unknown>,
// > = TValue extends InternalTypes.ValueDirectoryOrState<infer T> ? InternalTypes.ValueDirectoryOrState<T> : never;

// /**
//  * @internal
//  */
// export interface StateDatastoreSchema {
// 	// This type is not precise. It may
// 	// need to be replaced with PresenceStates schema pattern
// 	// similar to what is commented out.
// 	[key: string]: InternalTypes.ValueDirectoryOrState<unknown>;
// 	// [key: string]: StateDatastoreSchemaNode;
// }

/**
 * @internal
 */
export interface LocalStateUpdateOptions {
	allowableUpdateLatencyMs: number | undefined;

	/**
	 * Special option allowed for unicast notifications.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * @internal
 */
export interface StateDatastore<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<any>,
> {
	localUpdate(
		key: TKey,
		value: TValue & {
			ignoreUnmonitored?: true;
		},
		options: LocalStateUpdateOptions,
	): void;
	update(key: TKey, clientSessionId: ClientSessionId, value: TValue): void;
	knownValues(key: TKey): {
		self: ClientSessionId | undefined;
		states: ClientRecord<TValue>;
	};
	lookupClient(clientId: ClientConnectionId): ISessionClient;
}

/**
 * Helper to get a handle from a datastore.
 *
 * @internal
 */
export function handleFromDatastore<
	// Constraining TSchema would be great, but it seems nested types (at least with undefined) cause trouble.
	// TSchema as `unknown` still provides some type safety.
	// TSchema extends StateDatastoreSchema,
	TKey extends string /* & keyof TSchema */,
	TValue extends InternalTypes.ValueDirectoryOrState<unknown>,
>(
	datastore: StateDatastore<TKey, TValue>,
): InternalTypes.StateDatastoreHandle<TKey, Exclude<TValue, undefined>> {
	return datastore as unknown as InternalTypes.StateDatastoreHandle<
		TKey,
		Exclude<TValue, undefined>
	>;
}

/**
 * Helper to get the datastore back from its handle.
 *
 * @internal
 */
export function datastoreFromHandle<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<any>,
>(handle: InternalTypes.StateDatastoreHandle<TKey, TValue>): StateDatastore<TKey, TValue> {
	return handle as unknown as StateDatastore<TKey, TValue>;
}
