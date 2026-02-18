/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { IEmitter } from "@fluidframework/core-interfaces/internal";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import { OptionalBroadcastControl } from "./broadcastControls.js";
import type { BroadcastControlSettings } from "./broadcastControlsTypes.js";
import type { InternalTypes } from "./exposedInternalTypes.js";
import {
	asDeeplyReadonly,
	asDeeplyReadonlyDeserializedJson,
	isValueRequiredState,
	objectEntries,
	objectKeys,
	toOpaqueJson,
} from "./internalUtils.js";
import type {
	KeySchemaValidator,
	LatestMap,
	LatestMapClientData,
	LatestMapEvents,
	LatestMapFactory,
	LatestMapItemUpdatedClientData,
	LatestMapRaw,
	StateMap,
} from "./latestMapTypes.js";
import type { LatestData, StateSchemaValidator, ValueAccessor } from "./latestValueTypes.js";
import type { AttendeeId, Attendee, Presence, SpecificAttendee } from "./presence.js";
import { datastoreFromHandle, type StateDatastore } from "./stateDatastore.js";
import type { PostUpdateAction, ValueManager } from "./statesManagerTypes.js";
import type { ValidatableOptionalState } from "./validatableTypes.js";
import { createValidatedGetter } from "./validatedGetter.js";
import { brandIVM } from "./valueManager.js";

/**
 * Collection of validatable optional values in a "map" structure.
 *
 * @remarks
 * Validatable equivalent of {@link InternalTypes.MapValueState}.
 */
interface ValidatableMapValueState<T> {
	rev: number;
	items: {
		// Caution: any particular item may or may not exist
		// Typescript does not support absent keys without forcing type to also be undefined.
		// See https://github.com/microsoft/TypeScript/issues/42810.
		[name in string]: ValidatableOptionalState<T>;
	};
}

class ValueMapImpl<T, K extends string> implements StateMap<K, T> {
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
				string
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
				// TODO: AB#55932: try fixing typing of objectEntries to avoid this cast
				callbackfn(asDeeplyReadonlyDeserializedJson(item.value), key as unknown as K, this);
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
				// TODO: AB#55932: try fixing typing of objectEntries to avoid this cast
				keys.push(key as unknown as K);
			}
		}
		return keys[Symbol.iterator]();
	}
}

/**
 * Simply returns true for all given string keys.
 */
function anyKeyIsValid<Keys extends string>(unvalidatedKey: string): unvalidatedKey is Keys {
	return true;
}

class LatestMapValueManagerImpl<
	T,
	RegistrationKey extends string,
	Keys extends string = string,
> implements
		LatestMapRaw<T, Keys>,
		LatestMap<T, Keys>,
		Required<ValueManager<T, InternalTypes.MapValueState<T, Keys>>>
{
	public readonly events = createEmitter<LatestMapEvents<T, Keys, ValueAccessor<T>>>();
	public readonly controls: OptionalBroadcastControl;

	public constructor(
		private readonly key: RegistrationKey,
		private readonly datastore: StateDatastore<
			RegistrationKey,
			InternalTypes.MapValueState<T, Keys>,
			ValidatableMapValueState<T>
		>,
		public readonly value: InternalTypes.MapValueState<T, Keys>,
		controlSettings: BroadcastControlSettings | undefined,
		private readonly validator: StateSchemaValidator<T> | undefined,
		private readonly isValidKey: KeySchemaValidator<Keys>,
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
		const validator = this.validator;
		const allKnownStates = this.datastore.knownValues(this.key);
		const attendeeId = attendee.attendeeId;
		const clientStateMap = allKnownStates.states[attendeeId];
		if (clientStateMap === undefined) {
			throw new Error("No entry for attendee");
		}
		const items = new Map<Keys, LatestData<T, ValueAccessor<T>>>();
		for (const [key, item] of objectEntries(clientStateMap.items)) {
			if (this.isValidKey(key) && isValueRequiredState(item)) {
				items.set(key, {
					value: createValidatedGetter(item, validator),
					metadata: { revision: item.rev, timestamp: item.timestamp },
				});
			}
		}
		return items;
	}

	public update<SpecificAttendeeId extends AttendeeId>(
		attendee: SpecificAttendee<SpecificAttendeeId>,
		_received: number,
		value: InternalTypes.MapValueState<T, string>,
	): PostUpdateAction[] {
		const allKnownStates = this.datastore.knownValues(this.key);
		const attendeeId: SpecificAttendeeId = attendee.attendeeId;
		const currentState = (allKnownStates.states[attendeeId] ??=
			// New attendee - prepare new attendee state directory
			{
				rev: value.rev,
				items: {},
			});
		// Accumulate individual update keys
		const updatedKeyItemPairs: [string, InternalTypes.ValueOptionalState<T>][] = [];
		for (const [key, item] of objectEntries(value.items)) {
			const currentItem = currentState.items[key];
			if (currentItem === undefined || currentItem.rev < item.rev) {
				updatedKeyItemPairs.push([key, item]);
			}
		}

		if (updatedKeyItemPairs.length === 0) {
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
		for (const [key, item] of updatedKeyItemPairs) {
			const hadPriorValue = currentState.items[key]?.value;
			currentState.items[key] = item;

			// Prepare update events, but only for valid keys.
			if (!this.isValidKey(key)) {
				continue;
			}
			const metadata = {
				revision: item.rev,
				timestamp: item.timestamp,
			};
			if (isValueRequiredState(item)) {
				const updatedItem = {
					attendee,
					key,
					value: createValidatedGetter(item, this.validator),
					metadata,
				} satisfies LatestMapItemUpdatedClientData<T, Keys, ValueAccessor<T>>;
				postUpdateActions.push(() => this.events.emit("remoteItemUpdated", updatedItem));
				allUpdates.items.set(key, {
					value: updatedItem.value,
					metadata,
				});
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
		// Only emit remoteUpdated if there are any individual updates, which
		// accounts for the case where all updates were for invalid keys.
		if (postUpdateActions.length > 0) {
			postUpdateActions.push(() => this.events.emit("remoteUpdated", allUpdates));
		}
		return postUpdateActions;
	}
}

/**
 * Arguments that are passed to the {@link StateFactory.latestMap} function.
 *
 * @input
 * @beta
 */
export interface LatestMapArgumentsRaw<T, Keys extends string = string> {
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
export interface LatestMapArguments<T, Keys extends string = string>
	extends LatestMapArgumentsRaw<T, Keys> {
	/**
	 * An optional function that will be called at runtime to validate data value
	 * under a key. A runtime validator is strongly recommended.
	 * @see {@link StateSchemaValidator}.
	 */
	validator: StateSchemaValidator<T>;
	/**
	 * An optional function that will be called at runtime to validate the presence
	 * data key. A runtime validator is strongly recommended when key type is not
	 * simply `string`.
	 * @see {@link KeySchemaValidator}.
	 */
	keyValidator?: KeySchemaValidator<Keys>;
}

/**
 * Factory for creating a {@link LatestMap} or {@link LatestMapRaw} State object.
 */
export const latestMap: LatestMapFactory = <
	T,
	Keys extends string = string,
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
	const isKeyValid = args?.keyValidator ?? anyKeyIsValid;

	const timestamp = Date.now();
	const value: InternalTypes.MapValueState<
		T,
		// This should be `Keys`, but will only work if properties are optional.
		string
	> = { rev: 0, items: {} };
	// LatestMapRaw takes ownership of values within initialValues.
	if (initialValues !== undefined) {
		for (const [key, item] of objectEntries(initialValues)) {
			// TODO: AB#55932: try fixing typing of objectEntries to avoid this cast
			const assumedValidKey = key as unknown as Keys;
			value.items[assumedValidKey] = {
				rev: 0,
				timestamp,
				value: toOpaqueJson(item),
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
				validator,
				isKeyValid,
			),
		),
	});
	return Object.assign(factory, { instanceBase: LatestMapValueManagerImpl });
};
