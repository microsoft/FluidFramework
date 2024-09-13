/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LatestValueControls } from "./latestValueControls.js";
import type { LatestValueClientData, LatestValueData } from "./latestValueTypes.js";
import type { ISessionClient } from "./presence.js";

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluid-experimental/presence/internal/core-interfaces";
import type { ISubscribable } from "@fluid-experimental/presence/internal/events";
import type { InternalTypes } from "@fluid-experimental/presence/internal/exposedInternalTypes";
import type { InternalUtilityTypes } from "@fluid-experimental/presence/internal/exposedUtilityTypes";

/**
 * @sealed
 * @alpha
 */
export interface LatestValueManagerEvents<T> {
	/**
	 * Raised when remote client's value is updated, which may be the same value.
	 *
	 * @eventProperty
	 */
	updated: (update: LatestValueClientData<T>) => void;
}

/**
 * Value manager that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link Latest} registered to {@link PresenceStates}.
 *
 * @sealed
 * @alpha
 */
export interface LatestValueManager<T> {
	/**
	 * Events for Latest value manager.
	 */
	readonly events: ISubscribable<LatestValueManagerEvents<T>>;

	/**
	 * Controls for management of sending updates.
	 */
	readonly controls: LatestValueControls;

	/**
	 * Current state for this client.
	 * State for this client that will be transmitted to all other connected clients.
	 * @remarks Manager assumes ownership of the value and its references. Make a deep clone before
	 * setting, if needed. No comparison is done to detect changes; all sets are transmitted.
	 */
	get local(): InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>;
	set local(value: JsonSerializable<T> & JsonDeserialized<T>);

	/**
	 * Iterable access to remote clients' values.
	 * @remarks This is not yet implemented.
	 */
	clientValues(): IterableIterator<LatestValueClientData<T>>;
	/**
	 * Array of known clients.
	 */
	clients(): ISessionClient[];
	/**
	 * Access to a specific client's value.
	 */
	clientValue(client: ISessionClient): LatestValueData<T>;
}

/**
 * Factory for creating a {@link LatestValueManager}.
 *
 * @alpha
 */
export function Latest<T extends object, Key extends string>(
	initialValue: JsonSerializable<T> & JsonDeserialized<T> & object,
	controls?: LatestValueControls,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<T>,
	LatestValueManager<T>
> {
	throw new Error("Method not implemented.");
}
