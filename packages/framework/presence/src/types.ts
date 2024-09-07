/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InternalTypes } from "@fluid-experimental/presence/internal/exposedInternalTypes";

/**
 * Unique address within a session.
 *
 * @remarks
 * A string known to all clients working with a certain Workspace and unique
 * among Workspaces. Recommend using specifying concatenation of: type of
 * unique identifier, `:` (required), and unique identifier.
 *
 * @example Examples
 * ```typescript
 *   "guid:g0fl001d-1415-5000-c00l-g0fa54g0b1g1"
 *   "address:object0/sub-object2:pointers"
 * ```
 *
 * @alpha
 */
export type PresenceWorkspaceAddress = `${string}:${string}`;

/**
 * Single entry in {@link PresenceStatesSchema}.
 *
 * @alpha
 */
export type PresenceStatesEntry<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<unknown>,
	TManager = unknown,
> = InternalTypes.ManagerFactory<TKey, TValue, TManager>;

/**
 * Schema for an {@link PresenceStates}.
 *
 * Keys of schema are the keys of the {@link PresenceStates} providing access to `Value Manager`s.
 *
 * @alpha
 */
export interface PresenceStatesSchema {
	[key: string]: PresenceStatesEntry<typeof key, InternalTypes.ValueDirectoryOrState<any>>;
}

/**
 * Map of `Value Manager`s registered with {@link PresenceStates}.
 *
 * @sealed
 * @alpha
 */
export type PresenceStatesEntries<
	TSchema extends PresenceStatesSchema,
	TManagerRestrictions,
> = {
	/**
	 * Registered `Value Manager`s
	 */
	readonly [Key in Exclude<
		keyof TSchema,
		keyof PresenceStatesMethods<TSchema, TManagerRestrictions>
	>]: ReturnType<TSchema[Key]>["manager"] extends InternalTypes.StateValue<infer TManager>
		? TManager
		: never;
};

/**
 * Provides methods for managing `Value Manager`s in {@link PresenceStates}.
 *
 * @sealed
 * @alpha
 */
export interface PresenceStatesMethods<
	TSchema extends PresenceStatesSchema,
	TManagerRestrictions,
> {
	/**
	 * Registers a new `Value Manager` with the {@link PresenceStates}.
	 * @param key - new unique key for the `Value Manager`
	 * @param manager - factory for creating a `Value Manager`
	 */
	add<
		TKey extends string,
		TValue extends InternalTypes.ValueDirectoryOrState<any>,
		TManager extends TManagerRestrictions,
	>(
		key: TKey,
		manager: InternalTypes.ManagerFactory<TKey, TValue, TManager>,
	): asserts this is PresenceStates<
		TSchema & Record<TKey, InternalTypes.ManagerFactory<TKey, TValue, TManager>>
	>;
}

/**
 * `PresenceStates` maintains a registry of `Value Manager`s that all share and provide access to
 * presence state values across client members in a session.
 *
 * `Value Manager`s offer variations on how to manage states, but all share same principle that
 * each client's state is independent and may only be updated by originating client.
 *
 * @sealed
 * @alpha
 */
export type PresenceStates<
	TSchema extends PresenceStatesSchema,
	TManagerRestrictions = unknown,
> = PresenceStatesEntries<TSchema, TManagerRestrictions> &
	PresenceStatesMethods<TSchema, TManagerRestrictions>;
