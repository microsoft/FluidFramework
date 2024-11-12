/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluidframework/core-utils/internal";

import type { ValueManager } from "./internalTypes.js";
import { brandedObjectEntries } from "./internalTypes.js";
import type { LatestValueControls } from "./latestValueControls.js";
import { LatestValueControl } from "./latestValueControls.js";
import type { LatestValueClientData, LatestValueData } from "./latestValueTypes.js";
import type { ISessionClient } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

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

class LatestValueManagerImpl<T, Key extends string>
	implements
		LatestValueManager<T>,
		Required<ValueManager<T, InternalTypes.ValueRequiredState<T>>>
{
	public readonly events = createEmitter<LatestValueManagerEvents<T>>();
	public readonly controls: LatestValueControl;

	public constructor(
		private readonly key: Key,
		private readonly datastore: StateDatastore<Key, InternalTypes.ValueRequiredState<T>>,
		public readonly value: InternalTypes.ValueRequiredState<T>,
		controlSettings: LatestValueControls,
	) {
		this.controls = new LatestValueControl(controlSettings);
	}

	public get local(): InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>> {
		return this.value.value;
	}

	public set local(value: JsonSerializable<T> & JsonDeserialized<T>) {
		this.value.rev += 1;
		this.value.timestamp = Date.now();
		this.value.value = value;
		this.datastore.localUpdate(this.key, this.value, /* forceUpdate */ false);
	}

	public *clientValues(): IterableIterator<LatestValueClientData<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const [clientSessionId, value] of brandedObjectEntries(allKnownStates.states)) {
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
		const clientSessionId = client.sessionId;
		if (clientSessionId in allKnownStates.states) {
			const { value, rev: revision } = allKnownStates.states[clientSessionId];
			return { value, metadata: { revision, timestamp: Date.now() } };
		}
		throw new Error("No entry for clientId");
	}

	public update(
		client: ISessionClient,
		_received: number,
		value: InternalTypes.ValueRequiredState<T>,
	): void {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientSessionId = client.sessionId;
		if (clientSessionId in allKnownStates.states) {
			const currentState = allKnownStates.states[clientSessionId];
			if (currentState.rev >= value.rev) {
				return;
			}
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
	controls?: LatestValueControls,
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
		value: { ...initialValue },
	};
	const controlSettings = controls
		? { ...controls }
		: {
				allowableUpdateLatency: 60,
				forcedRefreshInterval: 0,
			};
	const factory = (
		key: Key,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			Key,
			InternalTypes.ValueRequiredState<T>
		>,
	): {
		value: typeof value;
		manager: InternalTypes.StateValue<LatestValueManager<T>>;
	} => ({
		value,
		manager: brandIVM<LatestValueManagerImpl<T, Key>, T, InternalTypes.ValueRequiredState<T>>(
			new LatestValueManagerImpl(
				key,
				datastoreFromHandle(datastoreHandle),
				value,
				controlSettings,
			),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
}
