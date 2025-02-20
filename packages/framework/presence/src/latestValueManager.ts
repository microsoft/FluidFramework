/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import { shallowCloneObject } from "@fluidframework/core-utils/internal";

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControls.js";
import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { ValueManager } from "./internalTypes.js";
import { objectEntries } from "./internalUtils.js";
import type { LatestValueClientData, LatestValueData } from "./latestValueTypes.js";
import type { ISessionClient } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/presence/internal/core-interfaces";
import type { InternalTypes } from "@fluidframework/presence/internal/exposedInternalTypes";
import type { InternalUtilityTypes } from "@fluidframework/presence/internal/exposedUtilityTypes";

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
	readonly events: Listenable<LatestValueManagerEvents<T>>;

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

class LatestValueManagerImpl<T, Key extends string>
	implements
		LatestValueManager<T>,
		Required<ValueManager<T, InternalTypes.ValueRequiredState<T>>>
{
	public readonly events = createEmitter<LatestValueManagerEvents<T>>();
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
	}

	public *clientValues(): IterableIterator<LatestValueClientData<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const [clientSessionId, value] of objectEntries(allKnownStates.states)) {
			if (clientSessionId !== allKnownStates.self) {
				yield {
					client: this.datastore.lookupClient(clientSessionId),
					value: value.value,
					metadata: { revision: value.rev, timestamp: value.timestamp },
				};
			}
		}
	}

	public clients(): ISessionClient[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return Object.keys(allKnownStates.states)
			.filter((clientSessionId) => clientSessionId !== allKnownStates.self)
			.map((clientSessionId) => this.datastore.lookupClient(clientSessionId));
	}

	public clientValue(client: ISessionClient): LatestValueData<T> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientState = allKnownStates.states[client.sessionId];
		if (clientState === undefined) {
			throw new Error("No entry for clientId");
		}
		return {
			value: clientState.value,
			metadata: { revision: clientState.rev, timestamp: Date.now() },
		};
	}

	public update(
		client: ISessionClient,
		_received: number,
		value: InternalTypes.ValueRequiredState<T>,
	): void {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientSessionId = client.sessionId;
		const currentState = allKnownStates.states[clientSessionId];
		if (currentState !== undefined && currentState.rev >= value.rev) {
			return;
		}
		this.datastore.update(this.key, clientSessionId, value);
		this.events.emit("updated", {
			client,
			value: value.value,
			metadata: { revision: value.rev, timestamp: value.timestamp },
		});
	}
}

/**
 * Factory for creating a {@link LatestValueManager}.
 *
 * @alpha
 */
export function Latest<T extends object, Key extends string = string>(
	initialValue: JsonSerializable<T> & JsonDeserialized<T> & object,
	controls?: BroadcastControlSettings,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<T>,
	LatestValueManager<T>
> {
	// LatestValueManager takes ownership of initialValue but makes a shallow
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
		manager: InternalTypes.StateValue<LatestValueManager<T>>;
	} => ({
		initialData: { value, allowableUpdateLatencyMs: controls?.allowableUpdateLatencyMs },
		manager: brandIVM<LatestValueManagerImpl<T, Key>, T, InternalTypes.ValueRequiredState<T>>(
			new LatestValueManagerImpl(key, datastoreFromHandle(datastoreHandle), value, controls),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
}
