/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable } from "@fluidframework/core-interfaces";
import type { IEmitter } from "@fluidframework/core-interfaces/internal";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { BroadcastControls, BroadcastControlSettings } from "./broadcastControls.js";
import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import type { PostUpdateAction, ValueManager } from "./internalTypes.js";
import {
	asDeeplyReadonly,
	asDeeplyReadonlyDeserializedJson,
	objectEntries,
	objectKeys,
	toOpaqueJson,
} from "./internalUtils.js";
import type {
	LatestClientData,
	LatestData,
	LatestMetadata,
	ProxiedValueAccessor,
	RawValueAccessor,
	StateSchemaValidator,
	ValueAccessor,
} from "./latestValueTypes.js";
import type { AttendeeId, Attendee, Presence, SpecificAttendee } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import { brandIVM } from "./valueManager.js";

/**
 * Collection of latest known values for a specific {@link Attendee}.
 *
 * @sealed
 * @beta
 */
export interface LatestMapClientData<
	T,
	Keys extends string | number,
	TValueAccessor extends ValueAccessor<T>,
	SpecificAttendeeId extends AttendeeId = AttendeeId,
> {
	/**
	 * Associated {@link Attendee}.
	 */
	attendee: Attendee<SpecificAttendeeId>;

	/**
	 * Map of items for the state.
	 *
	 * @privateRemarks This could be regular map currently as no Map is
	 * stored internally and a new instance is created for every request.
	 */
	items: ReadonlyMap<Keys, LatestData<T, TValueAccessor>>;
}

/**
 * State of a single item value, its key, and its metadata.
 *
 * @sealed
 * @beta
 */
export interface LatestMapItemUpdatedClientData<
	T,
	K extends string | number,
	TValueAccessor extends ValueAccessor<T>,
> extends LatestClientData<T, TValueAccessor> {
	/**
	 * Key of the updated item.
	 */
	key: K;
}

/**
 * Identifier and metadata for a removed item.
 *
 * @sealed
 * @beta
 */
export interface LatestMapItemRemovedClientData<K extends string | number> {
	/**
	 * Associated {@link Attendee}.
	 */
	attendee: Attendee;
	/**
	 * Key of the removed item.
	 */
	key: K;
	/**
	 * Metadata associated with the removal of the item.
	 */
	metadata: LatestMetadata;
}

/**
 * Events from {@link LatestMapRaw}.
 *
 * @sealed
 * @beta
 */
export interface LatestMapEvents<
	T,
	K extends string | number,
	TRemoteValueAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> {
	/**
	 * Raised when any item's value for remote client is updated.
	 * @param updates - Map of one or more values updated.
	 *
	 * @remarks The event does not include item removals.
	 *
	 * @eventProperty
	 */
	remoteUpdated: (updates: LatestMapClientData<T, K, TRemoteValueAccessor>) => void;

	/**
	 * Raised when specific item's value of remote client is updated.
	 * @param updatedItem - Updated item value.
	 *
	 * @eventProperty
	 */
	remoteItemUpdated: (
		updatedItem: LatestMapItemUpdatedClientData<T, K, TRemoteValueAccessor>,
	) => void;

	/**
	 * Raised when specific item of remote client is removed.
	 * @param removedItem - Removed item.
	 *
	 * @eventProperty
	 */
	remoteItemRemoved: (removedItem: LatestMapItemRemovedClientData<K>) => void;

	/**
	 * Raised when specific local item's value is updated.
	 * @param updatedItem - Updated item value.
	 *
	 * @eventProperty
	 */
	localItemUpdated: (updatedItem: {
		value: DeepReadonly<JsonSerializable<T>>;
		key: K;
	}) => void;

	/**
	 * Raised when specific local item is removed.
	 * @param removedItem - Removed item.
	 *
	 * @eventProperty
	 */
	localItemRemoved: (removedItem: {
		key: K;
	}) => void;
}

/**
 * Events from {@link LatestMapRaw}.
 *
 * @sealed
 * @beta
 */
export type LatestMapRawEvents<T, K extends string | number> = LatestMapEvents<
	T,
	K,
	RawValueAccessor<T>
>;

/**
 * Map of local client's values. Modifications are transmitted to all other connected clients.
 *
 * @sealed
 * @beta
 */
export interface StateMap<K extends string | number, V> {
	/**
	 * ${@link StateMap.delete}s all elements in the StateMap.
	 * @remarks This is not yet implemented.
	 */
	clear(): void;

	/**
	 * Removes the element with the specified key from the StateMap, if it exists.
	 *
	 * @returns true if an element in the StateMap existed and has been removed, or false if
	 * the element does not exist.
	 * @remarks No entry is fully removed. Instead an undefined placeholder is locally and
	 * transmitted to all other clients. For better performance limit the number of deleted
	 * entries and reuse keys when possible.
	 * @privateRemarks In the future we may add a mechanism to remove the placeholder, at least
	 * from transmissions after sufficient time has passed.
	 */
	delete(key: K): boolean;

	/**
	 * Executes a provided function once per each key/value pair in the StateMap, in arbitrary order.
	 */
	forEach(
		callbackfn: (
			value: DeepReadonly<JsonDeserialized<V>>,
			key: K,
			map: StateMap<K, V>,
		) => void,
		thisArg?: unknown,
	): void;

	/**
	 * Returns the element with the specified key from the StateMap, if it exists.
	 *
	 * @returns Returns the element associated with the specified key. If no element is associated with the specified key, undefined is returned.
	 */
	get(key: K): DeepReadonly<JsonDeserialized<V>> | undefined;

	/**
	 * Checks if an element with the specified key exists in the StateMap.
	 * @returns boolean indicating whether an element with the specified key exists or not.
	 */
	has(key: K): boolean;

	/**
	 * Adds a new element with a specified key and value to the StateMap. If an element with the same key already exists, the element will be updated.
	 * The value will be transmitted to all other connected clients.
	 *
	 * @remarks Manager assumes ownership of the value and its references.
	 * Make a deep clone before setting, if needed. No comparison is done to detect changes; all
	 * sets are transmitted.
	 */
	set(key: K, value: JsonSerializable<V>): this;

	/**
	 * The number of elements in the StateMap.
	 */
	readonly size: number;

	/**
	 * Returns an iterable of entries in the map.
	 */
	// [Symbol.iterator](): IterableIterator<[K, DeepReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	// entries(): IterableIterator<[K, DeepReadonly<JsonDeserialized<V>>]>;

	/**
	 * Returns an iterable of keys in the map.
	 */
	keys(): IterableIterator<K>;

	/**
	 * Returns an iterable of values in the map.
	 */
	// values(): IterableIterator<DeepReadonly<JsonDeserialized<V>>>;
}

class ValueMapImpl<T, K extends string | number> implements StateMap<K, T> {
	private countDefined: number;
	public constructor(
		private readonly value: InternalTypes.MapValueState<T, K>,
		private readonly emitter: IEmitter<
			Pick<LatestMapEvents<T, K, ValueAccessor<T>>, "localItemUpdated" | "localItemRemoved">
		>,
		private readonly localUpdate: (
			updates: InternalTypes.MapValueState<
				T,
				// This should be `K`, but will only work if properties are optional.
				string | number
			>,
		) => void,
	) {
		// All initial items are expected to be defined.
		// TODO assert all defined and/or update type.
		this.countDefined = Object.keys(value.items).length;
	}

	/**
	 * Note: caller must ensure key exists in this.value.items.
	 */
	private updateItem(key: K, value: InternalTypes.ValueOptionalState<T>["value"]): void {
		this.value.rev += 1;
		// Caller is required to ensure key exists.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const item = this.value.items[key]!;
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
			this.emitter.emit("localItemRemoved", { key });
		}
		return hasKey;
	}
	public forEach(
		callbackfn: (
			value: DeepReadonly<JsonDeserialized<T>>,
			key: K,
			map: StateMap<K, T>,
		) => void,
		thisArg?: unknown,
	): void {
		for (const [key, item] of objectEntries(this.value.items)) {
			if (item.value !== undefined) {
				callbackfn(asDeeplyReadonlyDeserializedJson(item.value), key, this);
			}
		}
	}
	public get(key: K): DeepReadonly<JsonDeserialized<T>> | undefined {
		return asDeeplyReadonlyDeserializedJson(this.value.items[key]?.value);
	}
	public has(key: K): boolean {
		return this.value.items[key]?.value !== undefined;
	}
	public set(key: K, inValue: JsonSerializable<T>): this {
		const value = toOpaqueJson<T>(inValue);
		if (!(key in this.value.items)) {
			this.countDefined += 1;
			this.value.items[key] = { rev: 0, timestamp: 0, value };
		}
		this.updateItem(key, value);
		this.emitter.emit("localItemUpdated", { key, value: asDeeplyReadonly(inValue) });
		return this;
	}
	public get size(): number {
		return this.countDefined;
	}
	public keys(): IterableIterator<K> {
		const keys: K[] = [];
		for (const [key, item] of objectEntries(this.value.items)) {
			if (item.value !== undefined) {
				keys.push(key);
			}
		}
		return keys[Symbol.iterator]();
	}
}

/**
 * State that provides a `Map` of latest known values from this client to
 * others and read access to their values.
 * Entries in the map may vary over time and by client, but all values are expected to
 * be of the same type, which may be a union type.
 *
 * @remarks Create using {@link StateFactory.latestMap} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export interface LatestMap<
	T,
	Keys extends string | number = string | number,
	TRemoteAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> {
	/**
	 * Containing {@link Presence}
	 */
	readonly presence: Presence;

	/**
	 * Events for LatestMap.
	 */
	readonly events: Listenable<LatestMapEvents<T, Keys, TRemoteAccessor>>;

	/**
	 * Controls for management of sending updates.
	 */
	readonly controls: BroadcastControls;

	/**
	 * Current value map for this client.
	 */
	readonly local: StateMap<Keys, T>;
	/**
	 * Iterable access to remote clients' map of values.
	 */
	getRemotes(): IterableIterator<LatestMapClientData<T, Keys, TRemoteAccessor>>;
	/**
	 * Array of {@link Attendee}s that have provided states.
	 */
	getStateAttendees(): Attendee[];
	/**
	 * Access to a specific client's map of values.
	 */
	getRemote(attendee: Attendee): ReadonlyMap<Keys, LatestData<T, TRemoteAccessor>>;
}

/**
 * State that provides a `Map` of latest known values from this client to
 * others and read access to their values.
 * Entries in the map may vary over time and by client, but all values are expected to
 * be of the same type, which may be a union type.
 *
 * @remarks Create using {@link StateFactory.latestMap} registered to {@link StatesWorkspace}.
 *
 * @sealed
 * @beta
 */
export type LatestMapRaw<T, Keys extends string | number = string | number> = LatestMap<
	T,
	Keys,
	RawValueAccessor<T>
>;

class LatestMapValueManagerImpl<
	T,
	RegistrationKey extends string,
	Keys extends string | number = string | number,
> implements
		LatestMapRaw<T, Keys>,
		LatestMap<T, Keys>,
		Required<ValueManager<T, InternalTypes.MapValueState<T, Keys>>>
{
	public readonly events = createEmitter<LatestMapEvents<T, Keys, RawValueAccessor<T>>>();
	public readonly controls: OptionalBroadcastControl;

	public constructor(
		private readonly key: RegistrationKey,
		private readonly datastore: StateDatastore<
			RegistrationKey,
			InternalTypes.MapValueState<T, Keys>
		>,
		public readonly value: InternalTypes.MapValueState<T, Keys>,
		controlSettings: BroadcastControlSettings | undefined,
	) {
		this.controls = new OptionalBroadcastControl(controlSettings);

		this.local = new ValueMapImpl<T, Keys>(
			value,
			this.events,
			(updates: InternalTypes.MapValueState<T, Keys>) => {
				datastore.localUpdate(key, updates, {
					allowableUpdateLatencyMs: this.controls.allowableUpdateLatencyMs,
				});
			},
		);
	}

	public get presence(): Presence {
		return this.datastore.presence;
	}

	public readonly local: StateMap<Keys, T>;

	public *getRemotes(): IterableIterator<LatestMapClientData<T, Keys, ValueAccessor<T>>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		for (const attendeeId of objectKeys(allKnownStates.states)) {
			if (attendeeId !== allKnownStates.self) {
				const attendee = this.datastore.presence.attendees.getAttendee(attendeeId);
				const items = this.getRemote(attendee);
				yield { attendee, items };
			}
		}
	}

	public getStateAttendees(): Attendee[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		return objectKeys(allKnownStates.states)
			.filter((attendeeId) => attendeeId !== allKnownStates.self)
			.map((attendeeId) => this.datastore.presence.attendees.getAttendee(attendeeId));
	}

	public getRemote(attendee: Attendee): ReadonlyMap<Keys, LatestData<T, ValueAccessor<T>>> {
		const allKnownStates = this.datastore.knownValues(this.key);
		const attendeeId = attendee.attendeeId;
		const clientStateMap = allKnownStates.states[attendeeId];
		if (clientStateMap === undefined) {
			throw new Error("No entry for attendee");
		}
		const items = new Map<Keys, LatestData<T, ValueAccessor<T>>>();
		for (const [key, item] of objectEntries(clientStateMap.items)) {
			const value = item.value;
			if (value !== undefined) {
				items.set(key, {
					value: asDeeplyReadonlyDeserializedJson(value),
					metadata: { revision: item.rev, timestamp: item.timestamp },
				});
			}
		}
		return items;
	}

	public update<SpecificAttendeeId extends AttendeeId>(
		attendee: SpecificAttendee<SpecificAttendeeId>,
		_received: number,
		value: InternalTypes.MapValueState<T, string | number>,
	): PostUpdateAction[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		const attendeeId: SpecificAttendeeId = attendee.attendeeId;
		const currentState = (allKnownStates.states[attendeeId] ??=
			// New attendee - prepare new attendee state directory
			{
				rev: value.rev,
				items: {} as unknown as InternalTypes.MapValueState<T, Keys>["items"],
			});
		// Accumulate individual update keys
		const updatedItemKeys: Keys[] = [];
		for (const [key, item] of objectEntries(value.items)) {
			// TODO: Key validation needs to be added here.
			const validKey = key as Keys;
			if (!(key in currentState.items) || currentState.items[validKey].rev < item.rev) {
				updatedItemKeys.push(validKey);
			}
		}

		if (updatedItemKeys.length === 0) {
			return [];
		}

		// Store updates
		if (value.rev > currentState.rev) {
			currentState.rev = value.rev;
		}
		const allUpdates = {
			attendee,
			items: new Map<Keys, LatestData<T, ValueAccessor<T>>>(),
		};
		const postUpdateActions: PostUpdateAction[] = [];
		for (const key of updatedItemKeys) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const item = value.items[key]!;
			const hadPriorValue = currentState.items[key]?.value;
			currentState.items[key] = item;
			const metadata = {
				revision: item.rev,
				timestamp: item.timestamp,
			};
			if (item.value !== undefined) {
				const itemValue = asDeeplyReadonlyDeserializedJson(item.value);
				const updatedItem = {
					attendee,
					key,
					value: itemValue,
					metadata,
				} satisfies LatestMapItemUpdatedClientData<T, Keys, RawValueAccessor<T>>;
				postUpdateActions.push(() => this.events.emit("remoteItemUpdated", updatedItem));
				allUpdates.items.set(key, { value: itemValue, metadata });
			} else if (hadPriorValue !== undefined) {
				postUpdateActions.push(() =>
					this.events.emit("remoteItemRemoved", {
						attendee,
						key,
						metadata,
					}),
				);
			}
		}
		this.datastore.update(this.key, attendeeId, currentState);
		postUpdateActions.push(() => this.events.emit("remoteUpdated", allUpdates));
		return postUpdateActions;
	}
}

/**
 * Arguments that are passed to the {@link StateFactory.latestMap} function.
 *
 * @input
 * @beta
 */
export interface LatestMapArgumentsRaw<T, Keys extends string | number = string | number> {
	/**
	 * The initial value of the local state.
	 */
	local?: {
		[K in Keys]: JsonSerializable<T>;
	};

	/**
	 * See {@link BroadcastControlSettings}.
	 */
	settings?: BroadcastControlSettings | undefined;
}

/**
 * Arguments that are passed to the {@link StateFactory.latestMap} function.
 *
 * @input
 * @beta
 */
export interface LatestMapArguments<T, Keys extends string | number = string | number>
	extends LatestMapArgumentsRaw<T, Keys> {
	/**
	 * A validator function that will be called to do runtime validation of the custom data stored in a presence state
	 * workspace.
	 */
	validator: StateSchemaValidator<T>;
}

// #region factory function overloads
// Overloads should be ordered from most specific to least specific when combined.

/**
 * Factory for creating a {@link LatestMapRaw} State object.
 *
 * @beta
 * @sealed
 */
export interface LatestMapFactory {
	/**
	 * Factory for creating a {@link LatestMapRaw} State object.
	 *
	 * @privateRemarks (change to `remarks` when adding signature overload)
	 * This overload is used when called with {@link LatestMapArgumentsRaw}.
	 * That is, if a validator function is _not_ provided.
	 */
	// eslint-disable-next-line @typescript-eslint/prefer-function-type -- interface to allow for clean overload evolution
	<T, Keys extends string | number = string | number, RegistrationKey extends string = string>(
		args?: LatestMapArgumentsRaw<T, Keys>,
	): InternalTypes.ManagerFactory<
		RegistrationKey,
		InternalTypes.MapValueState<T, Keys>,
		LatestMapRaw<T, Keys>
	>;
}

/**
 * Factory for creating a {@link LatestMap} or {@link LatestMapRaw} State object.
 */
export interface LatestMapFactoryInternal extends LatestMapFactory {
	/**
	 * Factory for creating a {@link LatestMap} State object.
	 *
	 * @remarks
	 * This overload is used when called with {@link LatestMapArguments}. That is, if a validator function is provided.
	 */
	<T, Keys extends string | number = string | number, RegistrationKey extends string = string>(
		args: LatestMapArguments<T, Keys>,
	): InternalTypes.ManagerFactory<
		RegistrationKey,
		InternalTypes.MapValueState<T, Keys>,
		LatestMap<T, Keys>
	>;
}

// #endregion

/**
 * Factory for creating a {@link LatestMap} or {@link LatestMapRaw} State object.
 */
export const latestMap: LatestMapFactoryInternal = <
	T,
	Keys extends string | number = string | number,
	RegistrationKey extends string = string,
>(
	args?: Partial<LatestMapArguments<T, Keys>>,
): InternalTypes.ManagerFactory<
	RegistrationKey,
	InternalTypes.MapValueState<T, Keys>,
	LatestMapRaw<T, Keys> & LatestMap<T, Keys>
> => {
	const settings = args?.settings;
	const initialValues = args?.local;
	const validator = args?.validator;

	if (validator !== undefined) {
		throw new Error(`Validators are not yet implemented.`);
	}

	const timestamp = Date.now();
	const value: InternalTypes.MapValueState<
		T,
		// This should be `Keys`, but will only work if properties are optional.
		string | number
	> = { rev: 0, items: {} };
	// LatestMapRaw takes ownership of values within initialValues.
	if (initialValues !== undefined) {
		for (const key of objectKeys(initialValues)) {
			value.items[key] = {
				rev: 0,
				timestamp,
				value: toOpaqueJson(initialValues[key]),
			};
		}
	}
	const factory = (
		key: RegistrationKey,
		datastoreHandle: InternalTypes.StateDatastoreHandle<
			RegistrationKey,
			InternalTypes.MapValueState<T, Keys>
		>,
	): {
		initialData: { value: typeof value; allowableUpdateLatencyMs: number | undefined };
		manager: InternalTypes.StateValue<LatestMapRaw<T, Keys> & LatestMap<T, Keys>>;
	} => ({
		initialData: { value, allowableUpdateLatencyMs: settings?.allowableUpdateLatencyMs },
		manager: brandIVM<
			LatestMapValueManagerImpl<T, RegistrationKey, Keys>,
			T,
			InternalTypes.MapValueState<T, Keys>
		>(
			new LatestMapValueManagerImpl(
				key,
				datastoreFromHandle(datastoreHandle),
				value,
				settings,
			),
		),
	});
	return Object.assign(factory, { instanceBase: LatestMapValueManagerImpl });
};
