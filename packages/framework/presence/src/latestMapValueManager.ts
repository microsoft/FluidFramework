/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectedClientId } from "./baseTypes.js";
import type { LatestValueControls } from "./latestValueControls.js";
import type {
	LatestValueClientData,
	LatestValueData,
	LatestValueMetadata,
} from "./latestValueTypes.js";
import type { ISessionClient } from "./presence.js";

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluid-experimental/presence/internal/core-interfaces";
import type { ISubscribable } from "@fluid-experimental/presence/internal/events";
import type { InternalTypes } from "@fluid-experimental/presence/internal/exposedInternalTypes";
import type { InternalUtilityTypes } from "@fluid-experimental/presence/internal/exposedUtilityTypes";

/**
 * Collection of latest known values for a specific client.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapValueClientData<
	T,
	Keys extends string | number,
	SpecificClientId extends ConnectedClientId = ConnectedClientId,
> {
	/**
	 * Associated client.
	 */
	client: ISessionClient<SpecificClientId>;

	/**
	 * @privateRemarks This could be regular map currently as no Map is
	 * stored internally and a new instance is created for every request.
	 */
	items: ReadonlyMap<Keys, LatestValueData<T>>;
}

/**
 * State of a single item value, its key, and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapItemValueClientData<T, K extends string | number>
	extends LatestValueClientData<T> {
	key: K;
}

/**
 * Identifier and metadata for a removed item.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapItemRemovedClientData<K extends string | number> {
	client: ISessionClient;
	key: K;
	metadata: LatestValueMetadata;
}

/**
 * @sealed
 * @alpha
 */
export interface LatestMapValueManagerEvents<T, K extends string | number> {
	/**
	 * Raised when any item's value for remote client is updated.
	 * @param updates - Map of one or more values updated.
	 *
	 * @remarks The event does not include item removals.
	 *
	 * @eventProperty
	 */
	updated: (updates: LatestMapValueClientData<T, K>) => void;

	/**
	 * Raised when specific item's value is updated.
	 * @param updatedItem - Updated item value.
	 *
	 * @eventProperty
	 */
	itemUpdated: (updatedItem: LatestMapItemValueClientData<T, K>) => void;

	/**
	 * Raised when specific item is removed.
	 * @param removedItem - Removed item.
	 *
	 * @eventProperty
	 */
	itemRemoved: (removedItem: LatestMapItemRemovedClientData<K>) => void;
}

/**
 * Map of local client's values. Modifications are transmitted to all other connected clients.
 *
 * @sealed
 * @alpha
 */
export interface ValueMap<K extends string | number, V> {
	/**
	 * ${@link ValueMap.delete}s all elements in the ValueMap.
	 * @remarks This is not yet implemented.
	 */
	clear(): void;

	/**
	 * @returns true if an element in the ValueMap existed and has been removed, or false if
	 * the element does not exist.
	 * @remarks No entry is fully removed. Instead an undefined placeholder is locally and
	 * transmitted to all other clients. For better performance limit the number of deleted
	 * entries and reuse keys when possible.
	 * @privateRemarks In the future we may add a mechanism to remove the placeholder, at least
	 * from transmissions after sufficient time has passed.
	 */
	delete(key: K): boolean;

	/**
	 * Executes a provided function once per each key/value pair in the ValueMap, in arbitrary order.
	 */
	forEach(
		callbackfn: (
			value: InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>,
			key: K,
			map: ValueMap<K, V>,
		) => void,
		thisArg?: unknown,
	): void;

	/**
	 * Returns a specified element from the ValueMap object.
	 * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
	 */
	get(key: K): InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>> | undefined;

	/**
	 * @returns boolean indicating whether an element with the specified key exists or not.
	 */
	has(key: K): boolean;

	/**
	 * Adds a new element with a specified key and value to the ValueMap. If an element with the same key already exists, the element will be updated.
	 * The value will be transmitted to all other connected clients.
	 *
	 * @remarks Manager assumes ownership of the value and its references.
	 * Make a deep clone before setting, if needed. No comparison is done to detect changes; all
	 * sets are transmitted.
	 */
	set(key: K, value: JsonSerializable<V> & JsonDeserialized<V>): this;

	/**
	 * @returns the number of elements in the ValueMap.
	 */
	readonly size: number;

	/**
	 * Returns an iterable of entries in the map.
	 */
	// [Symbol.iterator](): IterableIterator<[K, InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	// entries(): IterableIterator<[K, InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of keys in the map.
	 */
	keys(): IterableIterator<K>;

	/**
	 * Returns an iterable of values in the map.
	 */
	// values(): IterableIterator<InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>>;
}

/**
 * @sealed
 * @alpha
 */
export interface MapValueState<T> {
	rev: number;
	items: {
		// Caution: any particular item may or may not exist
		// Typescript does not support absent keys without forcing type to also be undefined.
		// See https://github.com/microsoft/TypeScript/issues/42810.
		[name: string | number]: InternalTypes.ValueOptionalState<T>;
	};
}

/**
 * Value manager that provides a `Map` of latest known values from this client to
 * others and read access to their values.
 * Entries in the map may vary over time and by client, but all values are expected to
 * be of the same type, which may be a union type.
 *
 * @remarks Create using {@link LatestMap} registered to {@link PresenceStates}.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapValueManager<T, Keys extends string | number = string | number> {
	/**
	 * Events for LatestMap value manager.
	 */
	readonly events: ISubscribable<LatestMapValueManagerEvents<T, Keys>>;

	/**
	 * Controls for management of sending updates.
	 */
	readonly controls: LatestValueControls;

	/**
	 * Current value map for this client.
	 */
	readonly local: ValueMap<Keys, T>;
	/**
	 * Iterable access to remote clients' map of values.
	 * @remarks This is not yet implemented.
	 */
	clientValues(): IterableIterator<LatestMapValueClientData<T, Keys>>;
	/**
	 * Array of known clients.
	 */
	clients(): ISessionClient[];
	/**
	 * Access to a specific client's map of values.
	 */
	clientValue<SpecificClientId extends ConnectedClientId>(
		client: ISessionClient<SpecificClientId>,
	): LatestMapValueClientData<T, Keys, SpecificClientId>;
}

/**
 * Factory for creating a {@link LatestMapValueManager}.
 *
 * @alpha
 */
export function LatestMap<
	T extends object,
	RegistrationKey extends string,
	Keys extends string | number = string | number,
>(
	initialValues?: {
		[K in Keys]: JsonSerializable<T> & JsonDeserialized<T>;
	},
	controls?: LatestValueControls,
): InternalTypes.ManagerFactory<
	RegistrationKey,
	MapValueState<T>,
	LatestMapValueManager<T, Keys>
> {
	throw new Error("Method not implemented.");
}
