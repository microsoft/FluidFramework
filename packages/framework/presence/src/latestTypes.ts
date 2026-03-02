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

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControlsTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type {
	LatestClientData,
	LatestData,
	ProxiedValueAccessor,
	RawValueAccessor,
	StateSchemaValidator,
	ValueAccessor,
} from "./latestValueTypes.js";
import type { Attendee, Presence } from "./presence.js";

/**
 * Events from {@link LatestRaw}.
 *
 * @sealed
 * @beta
 */
export interface LatestEvents<
	T,
	TRemoteValueAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> {
	/**
	 * Raised when remote client's value is updated, which may be the same value.
	 *
	 * @eventProperty
	 */
	remoteUpdated: (update: LatestClientData<T, TRemoteValueAccessor>) => void;

	/**
	 * Raised when local client's value is updated, which may be the same value.
	 *
	 * @eventProperty
	 */
	localUpdated: (update: { value: DeepReadonly<JsonSerializable<T>> }) => void;
}

/**
 * Events from {@link LatestRaw}.
 *
 * @sealed
 * @beta
 */
export type LatestRawEvents<T> = LatestEvents<T, RawValueAccessor<T>>;

/**
 * State that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link StateFactory}.{@link LatestFactory|latest} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export type LatestRaw<T> = Latest<T, RawValueAccessor<T>>;

/**
 * State that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link StateFactory}.{@link LatestFactory|latest} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export interface Latest<
	T,
	TRemoteAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> {
	/**
	 * Containing {@link Presence}
	 */
	readonly presence: Presence;

	/**
	 * Events for LatestRaw.
	 */
	readonly events: Listenable<LatestEvents<T, TRemoteAccessor>>;

	/**
	 * Controls for management of sending updates.
	 */
	readonly controls: BroadcastControls;

	/**
	 * Current state for this client.
	 * State for this client that will be transmitted to all other connected clients.
	 * @remarks Manager assumes ownership of the value and its references. Make a deep clone before
	 * setting, if needed. No comparison is done to detect changes; all sets are transmitted.
	 */
	get local(): DeepReadonly<JsonDeserialized<T>>;
	set local(value: JsonSerializable<T>);

	/**
	 * Array of {@link Attendee}s that have provided states.
	 */
	getStateAttendees(): Attendee[];

	/**
	 * Iterable access to remote clients' values.
	 */
	getRemotes(): IterableIterator<LatestClientData<T, TRemoteAccessor>>;

	/**
	 * Access to a specific attendee's value.
	 */
	getRemote(attendee: Attendee): LatestData<T, TRemoteAccessor>;
}

/**
 * Arguments that are passed to the {@link StateFactory}.{@link LatestFactory|latest} function to create a {@link LatestRaw} State object.
 *
 * @input
 * @beta
 */
export interface LatestArgumentsRaw<T extends object | null> {
	/**
	 * The initial value of the local state.
	 *
	 * @remarks
	 * `latest` assumes ownership of the value and its references.
	 * Make a deep clone before passing, if needed.
	 */
	local: JsonSerializable<T>;

	/**
	 * See {@link BroadcastControlSettings}.
	 */
	settings?: BroadcastControlSettings | undefined;
}

/**
 * Arguments that are passed to the {@link StateFactory}.{@link LatestFactory|latest} function to create a {@link Latest} State object.
 *
 * @input
 * @beta
 */
export interface LatestArguments<T extends object | null> extends LatestArgumentsRaw<T> {
	/**
	 * See {@link StateSchemaValidator}.
	 */
	validator: StateSchemaValidator<T>;
}

/**
 * Factory for creating a {@link Latest} or {@link LatestRaw} State object.
 *
 * @beta
 * @sealed
 */
export interface LatestFactory {
	/**
	 * Factory for creating a {@link Latest} State object.
	 *
	 * @remarks
	 * This overload is used when called with {@link LatestArguments}.
	 * That is, if a validator function is provided.
	 */
	<T extends object | null, Key extends string = string>(
		args: LatestArguments<T>,
	): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, Latest<T>>;

	/**
	 * Factory for creating a {@link LatestRaw} State object.
	 *
	 * @remarks
	 * This overload is used when called with {@link LatestArgumentsRaw}.
	 * That is, if a validator function is _not_ provided.
	 */
	<T extends object | null, Key extends string = string>(
		args: LatestArgumentsRaw<T>,
	): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, LatestRaw<T>>;
}
