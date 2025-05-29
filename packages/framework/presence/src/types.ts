/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BroadcastControls } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { NotificationsManager } from "./notificationsManager.js";
import type { Presence, PresenceWithNotifications } from "./presence.js";

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
 * @beta
 */
export type WorkspaceAddress = `${string}:${string}`;

/**
 * Single entry in {@link StatesWorkspaceSchema} or  {@link NotificationsWorkspaceSchema}.
 *
 * @beta
 */
export type StatesWorkspaceEntry<
	TKey extends string,
	TValue extends InternalTypes.ValueDirectoryOrState<unknown>,
	TManager = unknown,
> = InternalTypes.ManagerFactory<TKey, TValue, TManager>;

// #region StatesWorkspace

/**
 * Schema for a {@link StatesWorkspace} workspace.
 *
 * Keys of schema are the keys of the {@link StatesWorkspace} providing access to State objects.
 *
 * @beta
 */
export interface StatesWorkspaceSchema {
	/**
	 * Key-value pairs of State objects registered with the {@link StatesWorkspace}.
	 */
	[key: string]: StatesWorkspaceEntry<typeof key, InternalTypes.ValueDirectoryOrState<any>>;
}

/**
 * Map of State objects registered with {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export type StatesWorkspaceEntries<TSchema extends StatesWorkspaceSchema> = {
	/**
	 * Registered State objects.
	 */
	readonly [Key in keyof TSchema]: ReturnType<
		TSchema[Key]
	>["manager"] extends InternalTypes.StateValue<infer TManager>
		? TManager
		: never;
};

/**
 * `StatesWorkspace` maintains a registry of State objects that all share and provide access to
 * presence state values across client members in a session.
 *
 * State objects offer variations on how to manage states, but all share same principle that
 * each client's state is independent and may only be updated by originating client.
 *
 * @sealed
 * @beta
 */
export interface StatesWorkspace<
	TSchema extends StatesWorkspaceSchema,
	TManagerConstraints = unknown,
> {
	/**
	 * Registers a new State object with the {@link StatesWorkspace}.
	 * @param key - new unique key for the State object within the workspace
	 * @param manager - factory for creating a State object
	 */
	add<
		TKey extends string,
		TValue extends InternalTypes.ValueDirectoryOrState<any>,
		TManager extends TManagerConstraints,
	>(
		key: TKey,
		manager: InternalTypes.ManagerFactory<TKey, TValue, TManager>,
	): asserts this is StatesWorkspace<
		TSchema & Record<TKey, InternalTypes.ManagerFactory<TKey, TValue, TManager>>,
		TManagerConstraints
	>;

	/**
	 * Registry of State objects.
	 */
	readonly states: StatesWorkspaceEntries<TSchema>;

	/**
	 * Default controls for management of broadcast updates.
	 */
	readonly controls: BroadcastControls;

	/**
	 * Containing {@link Presence}
	 */
	readonly presence: Presence;
}

// #endregion StatesWorkspace

// #region NotificationsWorkspace

/**
 * Schema for a {@link NotificationsWorkspace} workspace.
 *
 * Keys of schema are the keys of the {@link NotificationsWorkspace} providing access to {@link NotificationsManager}s.
 *
 * @alpha
 */
export interface NotificationsWorkspaceSchema {
	[key: string]: InternalTypes.ManagerFactory<
		typeof key,
		InternalTypes.ValueRequiredState<InternalTypes.NotificationType>,
		NotificationsManager<any>
	>;
}

/**
 * `NotificationsWorkspace` maintains a registry of {@link NotificationsManager}s
 * that facilitate messages across client members in a session.
 *
 * @privateRemarks
 * This should be kept mostly in sync with {@link StatesWorkspace}. Notably the
 * return type of `add` is limited here and the `controls` property is omitted.
 * The `PresenceStatesImpl` class implements `AnyWorkspace` and therefore
 * `NotificationsWorkspace`, so long as this is proper subset.
 *
 * @sealed
 * @alpha
 */
export interface NotificationsWorkspace<TSchema extends NotificationsWorkspaceSchema> {
	/**
	 * Registers a new `NotificationsManager` with the {@link NotificationsWorkspace}.
	 * @param key - new unique key for the `NotificationsManager` within the workspace
	 * @param manager - factory for creating a `NotificationsManager`
	 */
	add<
		TKey extends string,
		TValue extends InternalTypes.ValueDirectoryOrState<any>,
		TManager extends NotificationsManager<any>,
	>(
		key: TKey,
		manager: InternalTypes.ManagerFactory<TKey, TValue, TManager>,
	): asserts this is NotificationsWorkspace<
		TSchema & Record<TKey, InternalTypes.ManagerFactory<TKey, TValue, TManager>>
	>;

	/**
	 * Registry of `NotificationsManager`s.
	 */
	readonly notifications: StatesWorkspaceEntries<TSchema>;

	/**
	 * Containing {@link PresenceWithNotifications}
	 */
	readonly presence: PresenceWithNotifications;
}

// #endregion NotificationsWorkspace

/**
 * `AnyWorkspace` is a superset of {@link StatesWorkspace} and {@link NotificationsWorkspace}.
 *
 * @internal
 */
export interface AnyWorkspace<
	TSchema extends StatesWorkspaceSchema,
	TManagerConstraints = unknown,
> extends StatesWorkspace<TSchema, TManagerConstraints> {
	readonly notifications: StatesWorkspaceEntries<TSchema>;
	// TO be removed if/when notifications are fully supported
	readonly presence: PresenceWithNotifications;
}
