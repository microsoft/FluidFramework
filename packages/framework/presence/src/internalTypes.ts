/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExtensionHost as ContainerExtensionHost } from "@fluidframework/container-runtime-definitions/internal";
import type { OpaqueJsonDeserialized } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

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
export interface ClientRecord<TValue extends InternalTypes.ValueDirectoryOrState<unknown>> {
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
 * Represents data that may have been validated by a {@link StateSchemaValidator} function.
 *
 * @system
 */
export interface ValidatedRequiredState<TValue>
	extends InternalTypes.ValueRequiredState<TValue> {
	/**
	 * Contains a validated value or undefined if `value` is invalid.
	 *
	 * This property will not be present if the data has not been validated.
	 * If it is present and `undefined`, the value has been checked and found to be invalid.
	 * Otherwise it will be the validated value.
	 */
	validatedValue?: OpaqueJsonDeserialized<TValue> | undefined;
}

/**
 * Internal version of ValueOptionalState that may contain validation metadata.
 * The `validatedValue` property is stripped before broadcasting.
 *
 * @system
 */
export interface ValidatedOptionalState<TValue>
	extends InternalTypes.ValueOptionalState<TValue> {
	/**
	 * Contains a validated value or undefined if `value` is invalid.
	 * This property is stripped before broadcasting to other clients.
	 */
	validatedValue?: OpaqueJsonDeserialized<TValue> | undefined;
}

/**
 * Internal version of ValueDirectory that may contain validation metadata.
 * The `validatedValue` properties in items are stripped before broadcasting.
 *
 * @system
 */
export interface ValidatedDirectory<T> {
	rev: number;
	items: {
		[name: string | number]: ValidatedOptionalState<T> | ValidatedDirectory<T>;
	};
}

/**
 * Internal convenience type for a required state, optional state, or a directory of values with validation metadata.
 *
 * @system
 */
export type ValidatedDirectoryOrState<T> =
	| ValidatedRequiredState<T>
	| ValidatedOptionalState<T>
	| ValidatedDirectory<T>;

/**
 * Internal version of ClientRecord that may contain validation metadata.
 *
 * @system
 */
export interface ValidatedClientRecord<TValue extends ValidatedDirectoryOrState<unknown>> {
	[AttendeeId: AttendeeId]: TValue;
}
