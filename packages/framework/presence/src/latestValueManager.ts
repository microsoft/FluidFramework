/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { shallowCloneObject } from "@fluidframework/core-utils/internal";

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControls.js";
import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { PostUpdateAction, ValueManager } from "./internalTypes.js";
import {
	asDeeplyReadonly,
	asDeeplyReadonlyDeserializedJson,
	objectEntries,
	toOpaqueJson,
} from "./internalUtils.js";
import type {
	LatestClientData,
	LatestData,
	ProxiedValueAccessor,
	RawValueAccessor,
	StateSchemaValidator,
	ValueAccessor,
} from "./latestValueTypes.js";
import type { Attendee, Presence } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

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
	localUpdated: (update: {
		value: DeepReadonly<JsonSerializable<T>>;
	}) => void;
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
 * @remarks Create using {@link StateFactory.latest} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export type LatestRaw<T> = Latest<T, RawValueAccessor<T>>;

/**
 * State that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link StateFactory.latest} registered to {@link StatesWorkspace}.
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

class LatestValueManagerImpl<T, Key extends string>
	implements
		LatestRaw<T>,
		Latest<T>,
		Required<ValueManager<T, InternalTypes.ValueRequiredState<T>>>
{
	public readonly events = createEmitter<LatestEvents<T, ValueAccessor<T>>>();
	public readonly controls: OptionalBroadcastControl;

	public constructor(
		private readonly key: Key,
		private readonly datastore: StateDatastore<Key, InternalTypes.ValueRequiredState<T>>,
		public readonly value: InternalTypes.ValueRequiredState<T>,
		controlSettings: BroadcastControlSettings | undefined,
	) {
		this.controls = new OptionalBroadcastControl(controlSettings);
	}

	public get presence(): Presence {
		return this.datastore.presence;
	}

	public get local(): DeepReadonly<JsonDeserialized<T>> {
		return asDeeplyReadonlyDeserializedJson(this.value.value);
	}

	public set local(value: JsonSerializable<T>) {
		this.value.rev += 1;
		this.value.timestamp = Date.now();
		this.value.value = toOpaqueJson<T>(value);
		this.datastore.localUpdate(this.key, this.value, {
			allowableUpdateLatencyMs: this.controls.allowableUpdateLatencyMs,
		});

		this.events.emit("localUpdated", { value: asDeeplyReadonly(value) });
	}

	public *getRemotes(): IterableIterator<LatestClientData<T, ValueAccessor<T>>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const [attendeeId, value] of objectEntries(allKnownStates.states)) {
			if (attendeeId !== allKnownStates.self) {
				yield {
					attendee: this.datastore.presence.attendees.getAttendee(attendeeId),
					value: asDeeplyReadonlyDeserializedJson(value.value),
					metadata: { revision: value.rev, timestamp: value.timestamp },
				};
			}
		}
	}

	public getStateAttendees(): Attendee[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return Object.keys(allKnownStates.states)
			.filter((attendeeId) => attendeeId !== allKnownStates.self)
			.map((attendeeId) => this.datastore.presence.attendees.getAttendee(attendeeId));
	}

	public getRemote(attendee: Attendee): LatestData<T, ValueAccessor<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientState = allKnownStates.states[attendee.attendeeId];
		if (clientState === undefined) {
			throw new Error("No entry for clientId");
		}
		return {
			value: asDeeplyReadonlyDeserializedJson(clientState.value),
			metadata: { revision: clientState.rev, timestamp: Date.now() },
		};
	}

	public update(
		attendee: Attendee,
		_received: number,
		value: InternalTypes.ValueRequiredState<T>,
	): PostUpdateAction[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		const attendeeId = attendee.attendeeId;
		const currentState = allKnownStates.states[attendeeId];
		if (currentState !== undefined && currentState.rev >= value.rev) {
			return [];
		}
		this.datastore.update(this.key, attendeeId, value);
		return [
			() =>
				this.events.emit("remoteUpdated", {
					attendee,
					value: asDeeplyReadonlyDeserializedJson(value.value),
					metadata: { revision: value.rev, timestamp: value.timestamp },
				}),
		];
	}
}

/**
 * Shallow clone an object that might be null.
 *
 * @param value - The object to clone
 * @returns A shallow clone of the input value
 */
export function shallowCloneNullableObject<T extends object | null>(value: T): T {
	return value === null ? value : shallowCloneObject(value);
}

/**
 * Arguments that are passed to the {@link StateFactory.latest} function to create a {@link LatestRaw} State object.
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
 * Arguments that are passed to the {@link StateFactory.latest} function to create a {@link Latest} State object.
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

// #region factory function overloads
// Overloads should be ordered from most specific to least specific when combined.

/**
 * Factory for creating a {@link LatestRaw} State object.
 *
 * @beta
 * @sealed
 */
export interface LatestFactory {
	/**
	 * Factory for creating a {@link LatestRaw} State object.
	 *
	 * @privateRemarks (change to `remarks` when adding signature overload)
	 * This overload is used when called with {@link LatestArgumentsRaw}.
	 * That is, if a validator function is _not_ provided.
	 */
	// eslint-disable-next-line @typescript-eslint/prefer-function-type -- interface to allow for clean overload evolution
	<T extends object | null, Key extends string = string>(
		args: LatestArgumentsRaw<T>,
	): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, LatestRaw<T>>;
}

/**
 * Factory for creating a {@link Latest} or {@link LatestRaw} State object.
 */
export interface LatestFactoryInternal extends LatestFactory {
	/**
	 * Factory for creating a {@link Latest} State object.
	 *
	 * @remarks
	 * This overload is used when called with {@link LatestArguments}. That is, if a validator function is provided.
	 */
	<T extends object | null, Key extends string = string>(
		args: LatestArguments<T>,
	): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, Latest<T>>;
}

// #endregion

/**
 * Factory for creating a {@link Latest} or {@link LatestRaw} State object.
 */
export const latest: LatestFactoryInternal = <
	T extends object | null,
	Key extends string = string,
>(
	args: LatestArguments<T> | LatestArgumentsRaw<T>,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<T>,
	LatestRaw<T> & Latest<T>
> => {
	const { local, settings } = args;
	if ("validator" in args) {
		throw new Error(`Validators are not yet implemented.`);
	}

	// Latest takes ownership of the initial local value but makes a shallow
	// copy for basic protection.
	const opaqueLocal = toOpaqueJson<T>(local);
	const value: InternalTypes.ValueRequiredState<T> = {
		rev: 0,
		timestamp: Date.now(),
		value: shallowCloneNullableObject(opaqueLocal),
	};
	const factory = (
		key: Key,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			Key,
			InternalTypes.ValueRequiredState<T>
		>,
	): {
		initialData: { value: typeof value; allowableUpdateLatencyMs: number | undefined };
		manager: InternalTypes.StateValue<LatestRaw<T> & Latest<T>>;
	} => ({
		initialData: { value, allowableUpdateLatencyMs: settings?.allowableUpdateLatencyMs },
		manager: brandIVM<LatestValueManagerImpl<T, Key>, T, InternalTypes.ValueRequiredState<T>>(
			new LatestValueManagerImpl(key, datastoreFromHandle(datastoreHandle), value, settings),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
};
