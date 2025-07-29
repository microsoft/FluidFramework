/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExtensionHost as ContainerExtensionHost } from "@fluidframework/container-runtime-definitions/internal";
import type {
	InternalUtilityTypes,
	OpaqueJsonDeserialized,
} from "@fluidframework/core-interfaces/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { AttendeeId, Attendee } from "./presence.js";
import type {
	OutboundAcknowledgementMessage,
	OutboundClientJoinMessage,
	OutboundDatastoreUpdateMessage,
	SignalMessages,
} from "./protocol.js";

/**
 * Presence {@link ContainerExtension} version of {@link @fluidframework/container-runtime-definitions#ExtensionRuntimeProperties}
 */
export interface ExtensionRuntimeProperties {
	SignalMessages: SignalMessages;
}
/**
 * Presence specific ExtensionHost
 */
export type ExtensionHost = ContainerExtensionHost<ExtensionRuntimeProperties>;

/**
 * Basic structure of set of {@link Attendee} records within Presence datastore
 *
 * @remarks
 * This is commonly exists per named state in State Managers.
 */
export interface ClientRecord<TValue extends ValidatableValueDirectoryOrState<unknown>> {
	// Caution: any particular item may or may not exist
	// Typescript does not support absent keys without forcing type to also be undefined.
	// See https://github.com/microsoft/TypeScript/issues/42810.
	[AttendeeId: AttendeeId]: TValue;
}

/**
 * This interface is a subset of ExtensionHost (and mostly of
 * FluidDataStoreRuntime) that is needed by the Presence States.
 *
 * @privateRemarks
 * Replace with non-DataStore based interface.
 */
export type IEphemeralRuntime = Omit<ExtensionHost, "logger" | "submitAddressedSignal"> &
	// Apart from tests, there is always a logger. So this could be promoted to required.
	Partial<Pick<ExtensionHost, "logger">> & {
		/**
		 * Submits the signal to be sent to other clients.
		 * @param type - Type of the signal.
		 * @param content - Content of the signal. Should be a JSON serializable object or primitive.
		 * @param targetClientId - When specified, the signal is only sent to the provided client id.
		 */
		submitSignal: (
			message:
				| OutboundAcknowledgementMessage
				| OutboundClientJoinMessage
				| OutboundDatastoreUpdateMessage,
		) => void;
	};

/**
 * Contract for State Managers as used by a States Workspace (`PresenceStatesImpl`)
 *
 * @remarks
 * See uses of `unbrandIVM`.
 */
export interface ValueManager<
	TValue,
	TValueState extends
		InternalTypes.ValueDirectoryOrState<TValue> = InternalTypes.ValueDirectoryOrState<TValue>,
> {
	// State objects should provide value - implement Required<ValueManager<...>>
	readonly value?: TValueState;
	update(attendee: Attendee, received: number, value: TValueState): PostUpdateAction[];
}

/**
 * A function to be called at the end of an update frame
 */
export type PostUpdateAction = () => void;

/**
 * Metadata for a value that may have been validated by a {@link StateSchemaValidator} function.
 */
interface ValidatableMetadata<TValue> {
	/**
	 * Contains a validated value or undefined if `value` is invalid.
	 *
	 * This property will not be present if the data has not been validated.
	 * If it is present and `undefined`, the value has been checked and found to be invalid.
	 * Otherwise it will be the validated value.
	 */
	validatedValue?: OpaqueJsonDeserialized<TValue> | undefined;
	// typeCheck: "do you have me?";
}

/**
 * Represents data with optional value that may have been validated by a
 * {@link StateSchemaValidator} function.
 */
export interface ValidatableOptionalState<TValue>
	extends Omit<InternalTypes.ValueOptionalState<TValue>, keyof ValidatableMetadata<TValue>>,
		ValidatableMetadata<TValue> {}

/**
 * Represents data with required value that may have been validated by a
 * {@link StateSchemaValidator} function.
 */
export interface ValidatableRequiredState<TValue>
	extends Omit<InternalTypes.ValueRequiredState<TValue>, keyof ValidatableMetadata<TValue>>,
		ValidatableMetadata<TValue> {}

/**
 * A directory of validatable values, where each value may be an optional
 * state or another directory.
 *
 * @remarks
 * The is the validatable version of {@link InternalTypes.ValueDirectory}.
 */
export interface ValidatableValueDirectory<T> {
	rev: number;
	items: {
		// Caution: any particular item may or may not exist
		// Typescript does not support absent keys without forcing type to also be undefined.
		// See https://github.com/microsoft/TypeScript/issues/42810.
		[name: string | number]: ValidatableOptionalState<T> | ValidatableValueDirectory<T>;
	};
}

/**
 * Convenience type for a validatable required state or a directory of values.
 *
 * @remarks
 * This is the validatable version of {@link InternalTypes.ValueDirectoryOrState}.
 */
export type ValidatableValueDirectoryOrState<T> =
	| ValidatableRequiredState<T>
	| ValidatableValueDirectory<T>;

/**
 * Transforms basic value datastore / protocol type into equivalent type
 * with validation support.
 *
 * @remarks
 * Use when some more specific or parameterized type equivalent of
 * `InternalTypes.Value(Directory|RequiredState|OptionalState)` is needed.
 *
 * Basically, wherever a `*ValueState` appears it is extended with
 * {@link ValidatableMetadata} to support validation.
 */
export type ValidatableValueStructure<
	T extends
		| InternalTypes.ValueDirectory<unknown>
		| InternalTypes.ValueRequiredState<unknown>
		| InternalTypes.ValueOptionalState<unknown>,
> = T extends InternalTypes.ValueDirectory<infer TValue>
	? InternalUtilityTypes.IfSameType<
			T,
			InternalTypes.ValueDirectory<T>,
			// Use canonical type for exact match
			ValidatableValueDirectory<TValue>,
			// Inexact match => recurse
			InternalUtilityTypes.FlattenIntersection<
				Omit<T, "items"> & {
					items: {
						[KItems in keyof T["items"]]: ValidatableValueStructure<T["items"][KItems]>;
					};
				}
			>
		>
	: T extends
				| InternalTypes.ValueRequiredState<infer TValue>
				| InternalTypes.ValueOptionalState<infer TValue>
		? InternalUtilityTypes.FlattenIntersection<
				Omit<T, keyof ValidatableMetadata<TValue>> & ValidatableMetadata<TValue>
			>
		: never;
