/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ExtensionHost as ContainerExtensionHost } from "@fluidframework/container-runtime-definitions/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";
import type { AttendeeId, Attendee } from "./presence.js";
import type {
	OutboundClientJoinMessage,
	OutboundDatastoreUpdateMessage,
	SignalMessages,
} from "./protocol.js";

/**
 * @internal
 */
export interface ExtensionRuntimeProperties {
	SignalMessages: SignalMessages;
}
/**
 * Presence specific ExtensionHost
 * @internal
 */
export type ExtensionHost = ContainerExtensionHost<ExtensionRuntimeProperties>;

/**
 * @internal
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
 *
 * @internal
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
			message: OutboundClientJoinMessage | OutboundDatastoreUpdateMessage,
		) => void;
	};

/**
 * @internal
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
 * @internal
 */
export type PostUpdateAction = () => void;
