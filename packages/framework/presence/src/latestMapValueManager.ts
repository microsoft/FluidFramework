/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControls.js";
import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { ValueManager } from "./internalTypes.js";
import type {
	LatestValueClientData,
	LatestValueData,
	LatestValueMetadata,
} from "./latestValueTypes.js";
import type { ClientSessionId, ISessionClient, SpecificSessionClient } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/presence/internal/core-interfaces";
import type { ISubscribable } from "@fluidframework/presence/internal/events";
import { createEmitter } from "@fluidframework/presence/internal/events";
import type { InternalTypes } from "@fluidframework/presence/internal/exposedInternalTypes";
import type { InternalUtilityTypes } from "@fluidframework/presence/internal/exposedUtilityTypes";

/**
 * Collection of latest known values for a specific client.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapValueClientData<
	T,
	Keys extends string | number,
	SpecificSessionClientId extends ClientSessionId = ClientSessionId,
> {
	/**
	 * Associated client.
	 */
	client: ISessionClient<SpecificSessionClientId>;

	/**
	 * @privateRemarks This could be regular map currently as no Map is
	 * stored internally and a new instance is created for every request.
	 */
	items: ReadonlyMap<Keys, LatestValueData<T>>;
}

/**
 * State of a single item value, its key, and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapItemValueClientData<T, K extends string | number>
	extends LatestValueClientData<T> {
	key: K;
}

/**
 * Identifier and metadata for a removed item.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapItemRemovedClientData<K extends string | number> {
	client: ISessionClient;
	key: K;
	metadata: LatestValueMetadata;
}

/**
 * @sealed
 * @alpha
 */
export interface LatestMapValueManagerEvents<T, K extends string | number> {
	/**
	 * Raised when any item's value for remote client is updated.
	 * @param updates - Map of one or more values updated.
	 *
	 * @remarks The event does not include item removals.
	 *
	 * @eventProperty
	 */
	updated: (updates: LatestMapValueClientData<T, K>) => void;

	/**
	 * Raised when specific item's value is updated.
	 * @param updatedItem - Updated item value.
	 *
	 * @eventProperty
	 */
	itemUpdated: (updatedItem: LatestMapItemValueClientData<T, K>) => void;

	/**
	 * Raised when specific item is removed.
	 * @param removedItem - Removed item.
	 *
	 * @eventProperty
	 */
	itemRemoved: (removedItem: LatestMapItemRemovedClientData<K>) => void;
}

/**
 * Map of local client's values. Modifications are transmitted to all other connected clients.
 *
 * @sealed
 * @alpha
 */
export interface ValueMap<K extends string | number, V> {
	/**
	 * ${@link ValueMap.delete}s all elements in the ValueMap.
	 * @remarks This is not yet implemented.
	 */
	clear(): void;

	/**
	 * @returns true if an element in the ValueMap existed and has been removed, or false if
	 * the element does not exist.
	 * @remarks No entry is fully removed. Instead an undefined placeholder is locally and
	 * transmitted to all other clients. For better performance limit the number of deleted
	 * entries and reuse keys when possible.
	 * @privateRemarks In the future we may add a mechanism to remove the placeholder, at least
	 * from transmissions after sufficient time has passed.
	 */
	delete(key: K): boolean;

	/**
	 * Executes a provided function once per each key/value pair in the ValueMap, in arbitrary order.
	 */
	forEach(
		callbackfn: (
			value: InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>,
			key: K,
			map: ValueMap<K, V>,
		) => void,
		thisArg?: unknown,
	): void;

	/**
	 * Returns a specified element from the ValueMap object.
	 * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
	 */
	get(key: K): InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>> | undefined;

	/**
	 * @returns boolean indicating whether an element with the specified key exists or not.
	 */
	has(key: K): boolean;

	/**
	 * Adds a new element with a specified key and value to the ValueMap. If an element with the same key already exists, the element will be updated.
	 * The value will be transmitted to all other connected clients.
	 *
	 * @remarks Manager assumes ownership of the value and its references.
	 * Make a deep clone before setting, if needed. No comparison is done to detect changes; all
	 * sets are transmitted.
	 */
	set(key: K, value: JsonSerializable<V> & JsonDeserialized<V>): this;

	/**
	 * @returns the number of elements in the ValueMap.
	 */
	readonly size: number;

	/**
	 * Returns an iterable of entries in the map.
	 */
	// [Symbol.iterator](): IterableIterator<[K, InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	// entries(): IterableIterator<[K, InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of keys in the map.
	 */
	keys(): IterableIterator<K>;

	/**
	 * Returns an iterable of values in the map.
	 */
	// values(): IterableIterator<InternalUtilityTypes.FullyReadonly<JsonDeserialized<V>>>;
}

class ValueMapImpl<T, K extends string | number> implements ValueMap<K, T> {
	private countDefined: number;
	public constructor(
		private readonly value: InternalTypes.MapValueState<T>,
		private readonly localUpdate: (updates: InternalTypes.MapValueState<T>) => void,
	) {
		// All initial items are expected to be defined.
		// TODO assert all defined and/or update type.
		this.countDefined = Object.keys(value.items).length;
	}

	private updateItem(key: K, value: InternalTypes.ValueOptionalState<T>["value"]): void {
		this.value.rev += 1;
		const item = this.value.items[key];
		item.rev += 1;
		item.timestamp = Date.now();
		if (value === undefined) {
			delete item.value;
		} else {
			item.value = value;
		}
		const update = { rev: this.value.rev, items: { [key]: item } };
		this.localUpdate(update);
	}

	public clear(): void {
		throw new Error("Method not implemented.");
	}
	public delete(key: K): boolean {
		const { items } = this.value;
		const hasKey = items[key]?.value !== undefined;
		if (hasKey) {
			this.countDefined -= 1;
			this.updateItem(key, undefined);
		}
		return hasKey;
	}
	public forEach(
		callbackfn: (
			value: InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>,
			key: K,
			map: ValueMap<K, T>,
		) => void,
		thisArg?: unknown,
	): void {
		for (const [key, item] of Object.entries(this.value.items)) {
			if (item.value !== undefined) {
				// TODO: see about typing InternalTypes.MapValueState with K
				callbackfn(item.value, key as K, this);
			}
		}
	}
	public get(key: K): InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>> | undefined {
		return this.value.items[key]?.value;
	}
	public has(key: K): boolean {
		return this.value.items[key]?.value !== undefined;
	}
	public set(key: K, value: JsonSerializable<T> & JsonDeserialized<T>): this {
		if (!(key in this.value.items)) {
			this.countDefined += 1;
			this.value.items[key] = { rev: 0, timestamp: 0, value };
		}
		this.updateItem(key, value);
		return this;
	}
	public get size(): number {
		return this.countDefined;
	}
	public keys(): IterableIterator<K> {
		const keys: K[] = [];
		for (const [key, item] of Object.entries(this.value.items)) {
			if (item.value !== undefined) {
				keys.push(key as K);
			}
		}
		return keys[Symbol.iterator]();
	}
}

/**
 * Value manager that provides a `Map` of latest known values from this client to
 * others and read access to their values.
 * Entries in the map may vary over time and by client, but all values are expected to
 * be of the same type, which may be a union type.
 *
 * @remarks Create using {@link LatestMap} registered to {@link PresenceStates}.
 *
 * @sealed
 * @alpha
 */
export interface LatestMapValueManager<T, Keys extends string | number = string | number> {
	/**
	 * Events for LatestMap value manager.
	 */
	readonly events: ISubscribable<LatestMapValueManagerEvents<T, Keys>>;

	/**
	 * Controls for management of sending updates.
	 */
	readonly controls: BroadcastControls;

	/**
	 * Current value map for this client.
	 */
	readonly local: ValueMap<Keys, T>;
	/**
	 * Iterable access to remote clients' map of values.
	 */
	clientValues(): IterableIterator<LatestMapValueClientData<T, Keys>>;
	/**
	 * Array of known clients.
	 */
	clients(): ISessionClient[];
	/**
	 * Access to a specific client's map of values.
	 */
	clientValue(client: ISessionClient): ReadonlyMap<Keys, LatestValueData<T>>;
}

class LatestMapValueManagerImpl<
	T,
	RegistrationKey extends string,
	Keys extends string | number = string | number,
> implements
		LatestMapValueManager<T, Keys>,
		Required<ValueManager<T, InternalTypes.MapValueState<T>>>
{
	public readonly events = createEmitter<LatestMapValueManagerEvents<T, Keys>>();
	public readonly controls: OptionalBroadcastControl;

	public constructor(
		private readonly key: RegistrationKey,
		private readonly datastore: StateDatastore<
			RegistrationKey,
			InternalTypes.MapValueState<T>
		>,
		public readonly value: InternalTypes.MapValueState<T>,
		controlSettings: BroadcastControlSettings | undefined,
	) {
		this.controls = new OptionalBroadcastControl(controlSettings);

		this.local = new ValueMapImpl<T, Keys>(
			value,
			(updates: InternalTypes.MapValueState<T>) => {
				datastore.localUpdate(key, updates, {
					allowableUpdateLatencyMs: this.controls.allowableUpdateLatencyMs,
				});
			},
		);
	}

	public readonly local: ValueMap<Keys, T>;

	public *clientValues(): IterableIterator<LatestMapValueClientData<T, Keys>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const clientSessionId of Object.keys(allKnownStates.states)) {
			if (clientSessionId !== allKnownStates.self) {
				const client = this.datastore.lookupClient(clientSessionId);
				const items = this.clientValue(client);
				yield { client, items };
			}
		}
	}

	public clients(): ISessionClient[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return Object.keys(allKnownStates.states)
			.filter((clientSessionId) => clientSessionId !== allKnownStates.self)
			.map((clientSessionId) => this.datastore.lookupClient(clientSessionId));
	}

	public clientValue(client: ISessionClient): ReadonlyMap<Keys, LatestValueData<T>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientSessionId = client.sessionId;
		if (!(clientSessionId in allKnownStates.states)) {
			throw new Error("No entry for client");
		}
		const clientStateMap = allKnownStates.states[clientSessionId];
		const items = new Map<Keys, LatestValueData<T>>();
		for (const [key, item] of Object.entries(clientStateMap.items)) {
			const value = item.value;
			if (value !== undefined) {
				items.set(key as Keys, {
					value,
					metadata: { revision: item.rev, timestamp: item.timestamp },
				});
			}
		}
		return items;
	}

	public update<SpecificSessionClientId extends ClientSessionId>(
		client: SpecificSessionClient<SpecificSessionClientId>,
		_received: number,
		value: InternalTypes.MapValueState<T>,
	): void {
		const allKnownStates = this.datastore.knownValues(this.key);
		const clientSessionId: SpecificSessionClientId = client.sessionId;
		if (!(clientSessionId in allKnownStates.states)) {
			// New client - prepare new client state directory
			allKnownStates.states[clientSessionId] = { rev: value.rev, items: {} };
		}
		const currentState = allKnownStates.states[clientSessionId];
		// Accumulate individual update keys
		const updatedItemKeys: Keys[] = [];
		for (const [key, item] of Object.entries(value.items)) {
			if (!(key in currentState.items) || currentState.items[key].rev < item.rev) {
				updatedItemKeys.push(key as Keys);
			}
		}

		if (updatedItemKeys.length === 0) {
			return;
		}

		// Store updates
		if (value.rev > currentState.rev) {
			currentState.rev = value.rev;
		}
		const allUpdates = {
			client,
			items: new Map<Keys, LatestValueData<T>>(),
		};
		for (const key of updatedItemKeys) {
			const item = value.items[key];
			const hadPriorValue = currentState.items[key]?.value;
			currentState.items[key] = item;
			const metadata = { revision: item.rev, timestamp: item.timestamp };
			if (item.value !== undefined) {
				this.events.emit("itemUpdated", {
					client,
					key,
					value: item.value,
					metadata,
				});
				allUpdates.items.set(key, { value: item.value, metadata });
			} else if (hadPriorValue !== undefined) {
				this.events.emit("itemRemoved", {
					client,
					key,
					metadata,
				});
			}
		}
		this.datastore.update(this.key, clientSessionId, currentState);
		this.events.emit("updated", allUpdates);
	}
}

/**
 * Factory for creating a {@link LatestMapValueManager}.
 *
 * @alpha
 */
export function LatestMap<
	T extends object,
	Keys extends string | number = string | number,
	RegistrationKey extends string = string,
>(
	initialValues?: {
		[K in Keys]: JsonSerializable<T> & JsonDeserialized<T>;
	},
	controls?: BroadcastControlSettings,
): InternalTypes.ManagerFactory<
	RegistrationKey,
	InternalTypes.MapValueState<T>,
	LatestMapValueManager<T, Keys>
> {
	const timestamp = Date.now();
	const value: InternalTypes.MapValueState<T> = { rev: 0, items: {} };
	// LatestMapValueManager takes ownership of values within initialValues.
	if (initialValues !== undefined) {
		for (const key of Object.keys(initialValues)) {
			value.items[key] = { rev: 0, timestamp, value: initialValues[key as Keys] };
		}
	}
	const factory = (
		key: RegistrationKey,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			RegistrationKey,
			InternalTypes.MapValueState<T>
		>,
	): {
		initialData: { value: typeof value; allowableUpdateLatencyMs: number | undefined };
		manager: InternalTypes.StateValue<LatestMapValueManager<T, Keys>>;
	} => ({
		initialData: { value, allowableUpdateLatencyMs: controls?.allowableUpdateLatencyMs },
		manager: brandIVM<
			LatestMapValueManagerImpl<T, RegistrationKey, Keys>,
			T,
			InternalTypes.MapValueState<T>
		>(
			new LatestMapValueManagerImpl(
				key,
				datastoreFromHandle(datastoreHandle),
				value,
				controls,
			),
		),
	});
	return Object.assign(factory, { instanceBase: LatestMapValueManagerImpl });
}
