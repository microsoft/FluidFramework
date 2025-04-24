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
import { asDeeplyReadonly, objectEntries } from "./internalUtils.js";
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
 * @sealed
 * @alpha
 */
export interface LatestEvents<T, TRemoteValueAccessor extends ValueAccessor<T>> {
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
		value: DeepReadonly<JsonSerializable<T> & JsonDeserialized<T>>;
	}) => void;
}

/**
 * State that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link StateFactory.latest} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @alpha
 */
export type LatestRaw<T> = Latest<T, RawValueAccessor<T>>;

/**
 * State that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link StateFactory.latest} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @alpha
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
	set local(value: JsonSerializable<T> & JsonDeserialized<T>);

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
		private readonly validator: StateSchemaValidator<T> | undefined,
		controlSettings: BroadcastControlSettings | undefined,
	) {
		this.controls = new OptionalBroadcastControl(controlSettings);
	}

	public get presence(): Presence {
		return this.datastore.presence;
	}

	public get local(): DeepReadonly<JsonDeserialized<T>> {
		return asDeeplyReadonly(this.value.value);
	}

	public set local(value: JsonSerializable<T> & JsonDeserialized<T>) {
		this.value.rev += 1;
		this.value.timestamp = Date.now();
		this.value.value = value;
		this.datastore.localUpdate(this.key, this.value, {
			allowableUpdateLatencyMs: this.controls.allowableUpdateLatencyMs,
		});

		this.events.emit("localUpdated", { value: asDeeplyReadonly(value) });
	}

	public *getRemotes(): IterableIterator<LatestClientData<T, ValueAccessor<T>>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const [attendeeId, clientState] of objectEntries(allKnownStates.states)) {
			yield {
				attendee: this.datastore.lookupClient(attendeeId),
				value:
					this.validator === undefined
						? clientState.value
						: () => {
								if (this.validator === undefined) {
									throw new Error(`No validator found`);
								}
								// let validData: JsonDeserialized<T> | undefined;
								if (attendeeId !== allKnownStates.self) {
									clientState.validData = this.validator(clientState.value);
								}
								return clientState.validData;
							},
				metadata: {
					revision: clientState.rev,
					timestamp: clientState.timestamp,
				},
			};
		}
	}

	public getStateAttendees(): Attendee[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return Object.keys(allKnownStates.states)
			.filter((attendeeId) => attendeeId !== allKnownStates.self)
			.map((attendeeId) => this.datastore.lookupClient(attendeeId));
	}

	public getRemote(attendee: Attendee): LatestData<T, ValueAccessor<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientState = allKnownStates.states[attendee.attendeeId];
		if (clientState === undefined) {
			throw new Error("No entry for clientId");
		}

		return {
			value:
				this.validator === undefined
					? clientState.value
					: () => {
							if (this.validator === undefined) {
								throw new Error(`No validator found`);
							}
							// let validData: JsonDeserialized<T> | undefined;
							clientState.validData = this.validator(clientState.value);
							return clientState.validData;
						},
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
					value: asDeeplyReadonly(value.value),
					metadata: { revision: value.rev, timestamp: value.timestamp },
				}),
		];
	}
}

/**
 * Arguments that are passed to the {@link StateFactory.latest} function.
 *
 * @alpha
 */
export interface LatestArguments<T extends object | null> {
	/**
	 * The initial value of the local state.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	local: JsonSerializable<T> & JsonDeserialized<T> & (object | null);

	/**
	 * See {@link BroadcastControlSettings}.
	 */
	settings?: BroadcastControlSettings | undefined;
	validator?: StateSchemaValidator<T> | undefined;
}

/**
 * Factory for creating a {@link Latest} State object.
 *
 * @alpha
 */
export function latest<T extends object | null, Key extends string = string>(
	args: LatestArguments<T> & { validator: StateSchemaValidator<T> },
): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, Latest<T>>;

/**
 * Factory for creating a {@link LatestRaw} State object.
 *
 * @alpha
 */
export function latest<T extends object | null, Key extends string = string>(
	args: LatestArguments<T>,
): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, LatestRaw<T>>;

/* eslint-disable jsdoc/require-jsdoc -- no tsdoc since the overloads are documented */
export function latest<T extends object | null, Key extends string = string>(
	args: LatestArguments<T>,
):
	| InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, LatestRaw<T>>
	| InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, Latest<T>> {
	const { local, settings, validator } = args;

	if (validator !== undefined) {
		throw new Error(`Validators are not yet implemented.`);
	}

	// Latest takes ownership of the initial local value but makes a shallow
	// copy for basic protection.
	const value: InternalTypes.ValueRequiredState<T> = {
		rev: 0,
		timestamp: Date.now(),
		value: local === null ? local : shallowCloneObject(local),
		validData: undefined,
	};
	const factory = (
		key: Key,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			Key,
			InternalTypes.ValueRequiredState<T>
		>,
	): {
		initialData: { value: typeof value; allowableUpdateLatencyMs: number | undefined };
		manager: InternalTypes.StateValue<LatestRaw<T>>;
	} => ({
		initialData: { value, allowableUpdateLatencyMs: settings?.allowableUpdateLatencyMs },
		manager: brandIVM<LatestValueManagerImpl<T, Key>, T, InternalTypes.ValueRequiredState<T>>(
			new LatestValueManagerImpl(
				key,
				datastoreFromHandle(datastoreHandle),
				value,
				validator,
				settings,
			),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
}
/* eslint-enable jsdoc/require-jsdoc -- no tsdoc since the overloads are documented */
