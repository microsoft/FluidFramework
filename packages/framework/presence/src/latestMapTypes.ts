/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listenable } from "@fluidframework/core-interfaces";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { BroadcastControlSettings, BroadcastControls } from "./broadcastControlsTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type {
	LatestClientData,
	LatestData,
	LatestMetadata,
	ProxiedValueAccessor,
	RawValueAccessor,
	StateSchemaValidator,
	ValueAccessor,
} from "./latestValueTypes.js";
import type { Attendee, AttendeeId, Presence } from "./presence.js";

/**
 * A validator function that can optionally be provided to do runtime validation
 * of the custom key listed in a {@link LatestMap}.
 *
 * @param unvalidatedKey - The unknown key that should be validated.
 *
 * @returns True if the key is valid.
 *
 * @beta
 */
export type KeySchemaValidator<Keys extends string> = (
	unvalidatedKey: string,
) => unvalidatedKey is Keys;

/**
 * Collection of latest known values for a specific {@link Attendee}.
 *
 * @sealed
 * @beta
 */
export interface LatestMapClientData<
	T,
	Keys extends string,
	TValueAccessor extends ValueAccessor<T>,
	SpecificAttendeeId extends AttendeeId = AttendeeId,
> {
	/**
	 * Associated {@link Attendee}.
	 */
	attendee: Attendee<SpecificAttendeeId>;

	/**
	 * Map of items for the state.
	 *
	 * @privateRemarks This could be regular map currently as no Map is
	 * stored internally and a new instance is created for every request.
	 */
	items: ReadonlyMap<Keys, LatestData<T, TValueAccessor>>;
}

/**
 * State of a single item value, its key, and its metadata.
 *
 * @sealed
 * @beta
 */
export interface LatestMapItemUpdatedClientData<
	T,
	K extends string,
	TValueAccessor extends ValueAccessor<T>,
> extends LatestClientData<T, TValueAccessor> {
	/**
	 * Key of the updated item.
	 */
	key: K;
}

/**
 * Identifier and metadata for a removed item.
 *
 * @sealed
 * @beta
 */
export interface LatestMapItemRemovedClientData<K extends string> {
	/**
	 * Associated {@link Attendee}.
	 */
	attendee: Attendee;

	/**
	 * Key of the removed item.
	 */
	key: K;

	/**
	 * Metadata associated with the removal of the item.
	 */
	metadata: LatestMetadata;
}

/**
 * Events from {@link LatestMapRaw}.
 *
 * @sealed
 * @beta
 */
export interface LatestMapEvents<
	T,
	K extends string,
	TRemoteValueAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> {
	/**
	 * Raised when any item's value for remote client is updated.
	 * @param updates - Map of one or more values updated.
	 *
	 * @remarks The event does not include item removals.
	 *
	 * @eventProperty
	 */
	remoteUpdated: (updates: LatestMapClientData<T, K, TRemoteValueAccessor>) => void;

	/**
	 * Raised when specific item's value of remote client is updated.
	 * @param updatedItem - Updated item value.
	 *
	 * @eventProperty
	 */
	remoteItemUpdated: (
		updatedItem: LatestMapItemUpdatedClientData<T, K, TRemoteValueAccessor>,
	) => void;

	/**
	 * Raised when specific item of remote client is removed.
	 * @param removedItem - Removed item.
	 *
	 * @eventProperty
	 */
	remoteItemRemoved: (removedItem: LatestMapItemRemovedClientData<K>) => void;

	/**
	 * Raised when specific local item's value is updated.
	 * @param updatedItem - Updated item value.
	 *
	 * @eventProperty
	 */
	localItemUpdated: (updatedItem: {
		value: DeepReadonly<JsonSerializable<T>>;
		key: K;
	}) => void;

	/**
	 * Raised when specific local item is removed.
	 * @param removedItem - Removed item.
	 *
	 * @eventProperty
	 */
	localItemRemoved: (removedItem: { key: K }) => void;
}

/**
 * Events from {@link LatestMapRaw}.
 *
 * @sealed
 * @beta
 */
export type LatestMapRawEvents<T, K extends string> = LatestMapEvents<
	T,
	K,
	RawValueAccessor<T>
>;

/**
 * Map of local client's values. Modifications are transmitted to all other connected clients.
 *
 * @sealed
 * @beta
 */
export interface StateMap<K extends string, V> {
	/**
	 * ${@link StateMap.delete}s all elements in the StateMap.
	 * @remarks This is not yet implemented.
	 */
	clear(): void;

	/**
	 * Removes the element with the specified key from the StateMap, if it exists.
	 *
	 * @returns true if an element in the StateMap existed and has been removed, or false if
	 * the element does not exist.
	 * @remarks No entry is fully removed. Instead an undefined placeholder is locally and
	 * transmitted to all other clients. For better performance limit the number of deleted
	 * entries and reuse keys when possible.
	 * @privateRemarks In the future we may add a mechanism to remove the placeholder, at least
	 * from transmissions after sufficient time has passed.
	 */
	delete(key: K): boolean;

	/**
	 * Executes a provided function once per each key/value pair in the StateMap, in arbitrary order.
	 */
	forEach(
		callbackfn: (
			value: DeepReadonly<JsonDeserialized<V>>,
			key: K,
			map: StateMap<K, V>,
		) => void,
		thisArg?: unknown,
	): void;

	/**
	 * Returns the element with the specified key from the StateMap, if it exists.
	 *
	 * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
	 */
	get(key: K): DeepReadonly<JsonDeserialized<V>> | undefined;

	/**
	 * Checks if an element with the specified key exists in the StateMap.
	 * @returns boolean indicating whether an element with the specified key exists or not.
	 */
	has(key: K): boolean;

	/**
	 * Adds a new element with a specified key and value to the StateMap. If an element with the same key already exists, the element will be updated.
	 * The value will be transmitted to all other connected clients.
	 *
	 * @remarks Manager assumes ownership of the value and its references.
	 * Make a deep clone before setting, if needed. No comparison is done to detect changes; all
	 * sets are transmitted.
	 */
	set(key: K, value: JsonSerializable<V>): this;

	/**
	 * The number of elements in the StateMap.
	 */
	readonly size: number;

	/**
	 * Returns an iterable of entries in the map.
	 */
	// [Symbol.iterator](): IterableIterator<[K, DeepReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	// entries(): IterableIterator<[K, DeepReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of keys in the map.
	 */
	keys(): IterableIterator<K>;

	/**
	 * Returns an iterable of values in the map.
	 */
	// values(): IterableIterator<DeepReadonly<JsonDeserialized<V>>>;
}

/**
 * State that provides a `Map` of latest known values from this client to
 * others and read access to their values.
 * Entries in the map may vary over time and by client, but all values are expected to
 * be of the same type, which may be a union type.
 *
 * @remarks Create using {@link StateFactory}.{@link LatestMapFactory|latestMap} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export interface LatestMap<
	T,
	Keys extends string = string,
	TRemoteAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> {
	/**
	 * Containing {@link Presence}
	 */
	readonly presence: Presence;

	/**
	 * Events for LatestMap.
	 */
	readonly events: Listenable<LatestMapEvents<T, Keys, TRemoteAccessor>>;

	/**
	 * Controls for management of sending updates.
	 */
	readonly controls: BroadcastControls;

	/**
	 * Current value map for this client.
	 */
	readonly local: StateMap<Keys, T>;

	/**
	 * Iterable access to remote clients' map of values.
	 */
	getRemotes(): IterableIterator<LatestMapClientData<T, Keys, TRemoteAccessor>>;

	/**
	 * Array of {@link Attendee}s that have provided states.
	 */
	getStateAttendees(): Attendee[];

	/**
	 * Access to a specific client's map of values.
	 */
	getRemote(attendee: Attendee): ReadonlyMap<Keys, LatestData<T, TRemoteAccessor>>;
}

/**
 * State that provides a `Map` of latest known values from this client to
 * others and read access to their values.
 * Entries in the map may vary over time and by client, but all values are expected to
 * be of the same type, which may be a union type.
 *
 * @remarks Create using {@link StateFactory}.{@link LatestMapFactory|latestMap} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export type LatestMapRaw<T, Keys extends string = string> = LatestMap<
	T,
	Keys,
	RawValueAccessor<T>
>;

/**
 * Arguments that are passed to the {@link StateFactory}.{@link LatestMapFactory|latestMap} function.
 *
 * @input
 * @beta
 */
export interface LatestMapArgumentsRaw<T, Keys extends string = string> {
	/**
	 * The initial value of the local state.
	 */
	local?: {
		[K in Keys]: JsonSerializable<T>;
	};

	/**
	 * See {@link BroadcastControlSettings}.
	 */
	settings?: BroadcastControlSettings | undefined;
}

/**
 * Arguments that are passed to the {@link StateFactory}.{@link LatestMapFactory|latestMap} function.
 *
 * @input
 * @beta
 */
export interface LatestMapArguments<T, Keys extends string = string>
	extends LatestMapArgumentsRaw<T, Keys> {
	/**
	 * An optional function that will be called at runtime to validate data value
	 * under a key. A runtime validator is strongly recommended.
	 * @see {@link StateSchemaValidator}.
	 */
	validator: StateSchemaValidator<T>;

	/**
	 * An optional function that will be called at runtime to validate the presence
	 * data key. A runtime validator is strongly recommended when key type is not
	 * simply `string`.
	 * @see {@link KeySchemaValidator}.
	 */
	keyValidator?: KeySchemaValidator<Keys>;
}

// #region factory function overloads
// Overloads should be ordered from most specific to least specific when combined.

/**
 * Factory for creating a {@link LatestMap} or {@link LatestMapRaw} State object.
 *
 * @beta
 * @sealed
 */
export interface LatestMapFactory {
	/**
	 * Factory for creating a {@link LatestMap} State object.
	 *
	 * @remarks
	 * This overload is used when called with {@link LatestMapArguments}.
	 * That is, if a validator function is provided.
	 */
	<T, Keys extends string = string, RegistrationKey extends string = string>(
		args: LatestMapArguments<T, Keys>,
	): InternalTypes.ManagerFactory<
		RegistrationKey,
		InternalTypes.MapValueState<T, Keys>,
		LatestMap<T, Keys>
	>;

	/**
	 * Factory for creating a {@link LatestMapRaw} State object.
	 *
	 * @remarks
	 * This overload is used when called with {@link LatestMapArgumentsRaw}.
	 * That is, if a validator function is _not_ provided.
	 */
	<T, Keys extends string = string, RegistrationKey extends string = string>(
		args?: LatestMapArgumentsRaw<T, Keys>,
	): InternalTypes.ManagerFactory<
		RegistrationKey,
		InternalTypes.MapValueState<T, Keys>,
		LatestMapRaw<T, Keys>
	>;
}

// #endregion
