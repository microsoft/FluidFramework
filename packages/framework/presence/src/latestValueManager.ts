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
	OpaqueJsonDeserialized,
} from "@fluidframework/core-interfaces/internal";
import { shallowCloneObject } from "@fluidframework/core-utils/internal";

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControls.js";
import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import {
	unbrandJson,
	brandJson,
	asDeeplyReadonlyFromJsonHandle,
} from "./exposedUtilityTypes.js";
import type { PostUpdateAction, ValueManager } from "./internalTypes.js";
import { asDeeplyReadonly, objectEntries } from "./internalUtils.js";
import type { LatestClientData, LatestData } from "./latestValueTypes.js";
import type { Attendee, Presence } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

/**
 * @sealed
 * @beta
 */
export interface LatestRawEvents<T> {
	/**
	 * Raised when remote client's value is updated, which may be the same value.
	 *
	 * @eventProperty
	 */
	remoteUpdated: (update: LatestClientData<T>) => void;

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
 * @beta
 */
export interface LatestRaw<T> {
	/**
	 * Containing {@link Presence}
	 */
	readonly presence: Presence;

	/**
	 * Events for LatestRaw.
	 */
	readonly events: Listenable<LatestRawEvents<T>>;

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
	 * Iterable access to remote clients' values.
	 */
	getRemotes(): IterableIterator<LatestClientData<T>>;
	/**
	 * Array of {@link Attendee}s that have provided states.
	 */
	getStateAttendees(): Attendee[];
	/**
	 * Access to a specific attendee's value.
	 */
	getRemote(attendee: Attendee): LatestData<T>;
}

class LatestValueManagerImpl<T, Key extends string>
	implements LatestRaw<T>, Required<ValueManager<T, InternalTypes.ValueRequiredState<T>>>
{
	public readonly events = createEmitter<LatestRawEvents<T>>();
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
		return asDeeplyReadonlyFromJsonHandle(this.value.value);
	}

	public set local(value: JsonSerializable<T>) {
		this.value.rev += 1;
		this.value.timestamp = Date.now();
		this.value.value = brandJson(value);
		this.datastore.localUpdate(this.key, this.value, {
			allowableUpdateLatencyMs: this.controls.allowableUpdateLatencyMs,
		});

		this.events.emit("localUpdated", { value: asDeeplyReadonly(value) });
	}

	public *getRemotes(): IterableIterator<LatestClientData<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const [attendeeId, value] of objectEntries(allKnownStates.states)) {
			if (attendeeId !== allKnownStates.self) {
				yield {
					attendee: this.datastore.lookupClient(attendeeId),
					value: asDeeplyReadonlyFromJsonHandle(value.value),
					metadata: { revision: value.rev, timestamp: value.timestamp },
				};
			}
		}
	}

	public getStateAttendees(): Attendee[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return Object.keys(allKnownStates.states)
			.filter((attendeeId) => attendeeId !== allKnownStates.self)
			.map((attendeeId) => this.datastore.lookupClient(attendeeId));
	}

	public getRemote(attendee: Attendee): LatestData<T> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientState = allKnownStates.states[attendee.attendeeId];
		if (clientState === undefined) {
			throw new Error("No entry for clientId");
		}
		return {
			value: asDeeplyReadonly(unbrandJson(clientState.value)),
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
					value: asDeeplyReadonly(unbrandJson(value.value)),
					metadata: { revision: value.rev, timestamp: value.timestamp },
				}),
		];
	}
}

/**
 * Arguments that are passed to the {@link StateFactory.latest} function.
 *
 * @beta
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
}

/**
 * Factory for creating a {@link LatestRaw} State object.
 *
 * @beta
 */
export function latest<T extends object | null, Key extends string = string>(
	args: LatestArguments<T>,
): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, LatestRaw<T>> {
	const { local, settings } = args;

	// Latest takes ownership of the initial local value but makes a shallow
	// copy for basic protection.
	const internalValue =
		local === null
			? (local as unknown as OpaqueJsonDeserialized<T>)
			: // FIXME: Why isn't this directly castable?
				(shallowCloneObject(local) as unknown as OpaqueJsonDeserialized<T>);
	const value: InternalTypes.ValueRequiredState<T> = {
		rev: 0,
		timestamp: Date.now(),
		value: internalValue,
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
			new LatestValueManagerImpl(key, datastoreFromHandle(datastoreHandle), value, settings),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
}
