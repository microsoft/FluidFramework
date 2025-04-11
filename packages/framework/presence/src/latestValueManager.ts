/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { shallowCloneObject } from "@fluidframework/core-utils/internal";

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControls.js";
import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
import type { PostUpdateAction, ValueManager } from "./internalTypes.js";
import { objectEntries } from "./internalUtils.js";
import type { LatestClientData, LatestData } from "./latestValueTypes.js";
import type { Attendee } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

/**
 * @sealed
 * @alpha
 */
export interface LatestEvents<T> {
	/**
	 * Raised when remote client's value is updated, which may be the same value.
	 *
	 * @eventProperty
	 */
	updated: (update: LatestClientData<T>) => void;

	/**
	 * Raised when local client's value is updated, which may be the same value.
	 *
	 * @eventProperty
	 */
	localUpdated: (update: {
		value: InternalUtilityTypes.FullyReadonly<JsonSerializable<T> & JsonDeserialized<T>>;
	}) => void;
}

/**
 * State that provides the latest known value from this client to others and read access to their values.
 * All participant clients must provide a value.
 *
 * @remarks Create using {@link latestStateFactory} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @alpha
 */
export interface Latest<T> {
	/**
	 * Events for Latest.
	 */
	readonly events: Listenable<LatestEvents<T>>;

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
	get local(): InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>;
	set local(value: JsonSerializable<T> & JsonDeserialized<T>);

	/**
	 * Iterable access to remote clients' values.
	 */
	clientValues(): IterableIterator<LatestClientData<T>>;
	/**
	 * Array of known remote clients.
	 */
	clients(): Attendee[];
	/**
	 * Access to a specific attendee's value.
	 */
	clientValue(attendee: Attendee): LatestData<T>;
}

class LatestValueManagerImpl<T, Key extends string>
	implements Latest<T>, Required<ValueManager<T, InternalTypes.ValueRequiredState<T>>>
{
	public readonly events = createEmitter<LatestEvents<T>>();
	public readonly controls: OptionalBroadcastControl;

	public constructor(
		private readonly key: Key,
		private readonly datastore: StateDatastore<Key, InternalTypes.ValueRequiredState<T>>,
		public readonly value: InternalTypes.ValueRequiredState<T>,
		controlSettings: BroadcastControlSettings | undefined,
	) {
		this.controls = new OptionalBroadcastControl(controlSettings);
	}

	public get local(): InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>> {
		return this.value.value;
	}

	public set local(value: JsonSerializable<T> & JsonDeserialized<T>) {
		this.value.rev += 1;
		this.value.timestamp = Date.now();
		this.value.value = value;
		this.datastore.localUpdate(this.key, this.value, {
			allowableUpdateLatencyMs: this.controls.allowableUpdateLatencyMs,
		});

		this.events.emit("localUpdated", { value });
	}

	public *clientValues(): IterableIterator<LatestClientData<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const [attendeeId, value] of objectEntries(allKnownStates.states)) {
			if (attendeeId !== allKnownStates.self) {
				yield {
					attendee: this.datastore.lookupClient(attendeeId),
					value: value.value,
					metadata: { revision: value.rev, timestamp: value.timestamp },
				};
			}
		}
	}

	public clients(): Attendee[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return Object.keys(allKnownStates.states)
			.filter((attendeeId) => attendeeId !== allKnownStates.self)
			.map((attendeeId) => this.datastore.lookupClient(attendeeId));
	}

	public clientValue(attendee: Attendee): LatestData<T> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientState = allKnownStates.states[attendee.attendeeId];
		if (clientState === undefined) {
			throw new Error("No entry for clientId");
		}
		return {
			value: clientState.value,
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
				this.events.emit("updated", {
					attendee,
					value: value.value,
					metadata: { revision: value.rev, timestamp: value.timestamp },
				}),
		];
	}
}

/**
 * Factory for creating a {@link Latest}.
 *
 * @alpha
 */
export function latestStateFactory<T extends object, Key extends string = string>(
	initialValue: JsonSerializable<T> & JsonDeserialized<T> & object,
	controls?: BroadcastControlSettings,
): InternalTypes.ManagerFactory<Key, InternalTypes.ValueRequiredState<T>, Latest<T>> {
	// Latest takes ownership of initialValue but makes a shallow
	// copy for basic protection.
	const value: InternalTypes.ValueRequiredState<T> = {
		rev: 0,
		timestamp: Date.now(),
		value: shallowCloneObject(initialValue),
	};
	const factory = (
		key: Key,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			Key,
			InternalTypes.ValueRequiredState<T>
		>,
	): {
		initialData: { value: typeof value; allowableUpdateLatencyMs: number | undefined };
		manager: InternalTypes.StateValue<Latest<T>>;
	} => ({
		initialData: { value, allowableUpdateLatencyMs: controls?.allowableUpdateLatencyMs },
		manager: brandIVM<LatestValueManagerImpl<T, Key>, T, InternalTypes.ValueRequiredState<T>>(
			new LatestValueManagerImpl(key, datastoreFromHandle(datastoreHandle), value, controls),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
}
