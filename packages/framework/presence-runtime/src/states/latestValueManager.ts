/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type {
	Attendee,
	BroadcastControlSettings,
	Latest,
	LatestArguments,
	LatestArgumentsRaw,
	LatestClientData,
	LatestData,
	LatestEvents,
	LatestFactory,
	LatestRaw,
	Presence,
	StateSchemaValidator,
	ValueAccessor,
} from "@fluid-internal/presence-definitions";
import type {
	InternalTypes,
	PostUpdateAction,
	ValueManager,
} from "@fluid-internal/presence-definitions/internal";
import type { StateDatastore } from "@fluid-internal/presence-definitions/internal/workspace-states";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { shallowCloneObject } from "@fluidframework/core-utils/internal";

import type { FlattenUnionWithOptionals } from "@fluid-internal/presence-runtime/utils";
import {
	asDeeplyReadonly,
	asDeeplyReadonlyDeserializedJson,
	brandIVM,
	objectEntries,
	OptionalBroadcastControl,
	toOpaqueJson,
} from "@fluid-internal/presence-runtime/utils";
import { datastoreFromHandle } from "@fluid-internal/presence-runtime/workspace";

import { createValidatedGetter } from "./validatedGetter.js";

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
		private readonly validator: StateSchemaValidator<T> | undefined,
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
		for (const [attendeeId, clientState] of objectEntries(allKnownStates.states)) {
			if (attendeeId !== allKnownStates.self) {
				yield {
					attendee: this.datastore.presence.attendees.getAttendee(attendeeId),
					value: createValidatedGetter(clientState, this.validator),
					metadata: {
						revision: clientState.rev,
						timestamp: clientState.timestamp,
					},
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
			throw new Error("No entry for attendee");
		}
		return {
			value: createValidatedGetter(clientState, this.validator),
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
					value: createValidatedGetter(value, this.validator),
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
function shallowCloneNullableObject<T extends object | null>(value: T): T {
	return value === null ? value : shallowCloneObject(value);
}

/**
 * Factory for creating a {@link Latest} or {@link LatestRaw} State object.
 */
export const latest: LatestFactory = <T extends object | null, Key extends string = string>(
	args: FlattenUnionWithOptionals<LatestArguments<T> | LatestArgumentsRaw<T>>,
): InternalTypes.ManagerFactory<
	Key,
	InternalTypes.ValueRequiredState<T>,
	LatestRaw<T> & Latest<T>
> => {
	const { local, settings, validator } = args;
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
			new LatestValueManagerImpl(
				key,
				datastoreFromHandle(datastoreHandle),
				value,
				settings,
				validator,
			),
		),
	});
	return Object.assign(factory, { instanceBase: LatestValueManagerImpl });
};
