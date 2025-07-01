/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ClientConnectionId } from "./baseTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { ClientRecord } from "./internalTypes.js";
import type { AttendeeId, PresenceWithNotifications as Presence } from "./presence.js";

// type StateDatastoreSchemaNode<
// 	TValue extends InternalTypes.ValueDirectoryOrState<any> = InternalTypes.ValueDirectoryOrState<unknown>,
// > = TValue extends InternalTypes.ValueDirectoryOrState<infer T> ? InternalTypes.ValueDirectoryOrState<T> : never;

// export interface StateDatastoreSchema {
// 	// This type is not precise. It may
// 	// need to be replaced with StatesWorkspace schema pattern
// 	// similar to what is commented out.
// 	[key: string]: InternalTypes.ValueDirectoryOrState<unknown>;
// 	// [key: string]: StateDatastoreSchemaNode;
// }

/**
 * Miscellaneous options for local state updates
 */
export interface LocalStateUpdateOptions {
	/**
	 * When defined, this is the maximum time in milliseconds that this
	 * update is allowed to be delayed before it must be sent to service.
	 * When `undefined`, the callee may determine maximum delay.
	 */
	allowableUpdateLatencyMs: number | undefined;

	/**
	 * Special option allowed for unicast notifications.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * Contract for States Workspace to support State Manager access to
 * datastore and general internal presence knowledge.
 */
export interface StateDatastore<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<any>,
> {
	readonly presence: Presence;
	localUpdate(
		key: TKey,
		value: TValue & {
			ignoreUnmonitored?: true;
		},
		options: LocalStateUpdateOptions,
	): void;
	update(key: TKey, attendeeId: AttendeeId, value: TValue): void;
	knownValues(key: TKey): {
		self: AttendeeId | undefined;
		states: ClientRecord<TValue>;
	};
}

/**
 * Helper to get a handle from a datastore.
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
 */
export function datastoreFromHandle<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<any>,
>(handle: InternalTypes.StateDatastoreHandle<TKey, TValue>): StateDatastore<TKey, TValue> {
	return handle as unknown as StateDatastore<TKey, TValue>;
}
