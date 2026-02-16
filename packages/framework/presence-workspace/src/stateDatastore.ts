/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalTypes } from "@fluid-internal/presence-definitions/internal";
import type { StateDatastore } from "@fluid-internal/presence-definitions/internal/workspace-states";

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
 *
 * @internal
 */
export function datastoreFromHandle<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<unknown>,
>(handle: InternalTypes.StateDatastoreHandle<TKey, TValue>): StateDatastore<TKey, TValue> {
	return handle as unknown as StateDatastore<TKey, TValue>;
}
