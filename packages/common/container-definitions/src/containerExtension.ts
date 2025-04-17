/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- BrandedType is a class declaration only
import type {
	BrandedType,
	InternalUtilityTypes,
	ITelemetryBaseLogger,
	JsonDeserialized,
	JsonSerializable,
	Listenable,
	TypedMessage,
} from "@fluidframework/core-interfaces/internal";
import type { IQuorumClients } from "@fluidframework/driver-definitions/internal";

import type { IAudience } from "./audience.js";

/**
 * While connected, the id of a client within a session.
 *
 * @internal
 */
export type ClientConnectionId = string;

/**
 * Common structure between incoming and outgoing extension signals.
 *
 * @remarks
 * Do not use directly, use {@link OutboundExtensionMessage} or {@link InboundExtensionMessage} instead.
 *
 * @sealed
 * @internal
 */
export type ExtensionMessage<
	TMessage extends TypedMessage = {
		type: string;
		content: JsonSerializable<unknown> | JsonDeserialized<unknown>;
	},
> = // `TMessage extends TypedMessage` encourages processing union elements individually
	TMessage extends TypedMessage
		? InternalUtilityTypes.FlattenIntersection<
				TMessage & {
					/**
					 * Client ID of the singular client the message is being (or has been) sent to.
					 * May only be specified when IConnect.supportedFeatures['submit_signals_v2'] is true, will throw otherwise.
					 */
					targetClientId?: ClientConnectionId;
				}
			>
		: never;

/**
 * Outgoing extension signals.
 *
 * @sealed
 * @internal
 */
export type OutboundExtensionMessage<TMessage extends TypedMessage = TypedMessage> =
	ExtensionMessage<{ type: TMessage["type"]; content: JsonSerializable<TMessage["content"]> }>;

/**
 * Brand for value that has not been verified.
 *
 * Usage:
 *
 * - Cast to with `as unknown as UnverifiedBrand<T>` when value of or containing expected type `T` is yet unknown.
 *
 * - Cast from with `as unknown` when "instance" will be parsed to `T`.
 *
 * @sealed
 * @internal
 */
export declare class UnverifiedBrand<T> extends BrandedType<T> {
	private readonly UnverifiedValue: T;
	private constructor();
}

/**
 * Unverified incoming extension signals.
 *
 * @sealed
 * @internal
 */
export type RawInboundExtensionMessage<TMessage extends TypedMessage = TypedMessage> =
	// `TMessage extends TypedMessage` encourages processing union elements individually
	TMessage extends TypedMessage
		? InternalUtilityTypes.FlattenIntersection<
				ExtensionMessage<{
					type: string;
					content: JsonDeserialized<unknown>;
				}> & {
					/**
					 * The client ID that submitted the message.
					 * For server generated messages the clientId will be null.
					 */
					// eslint-disable-next-line @rushstack/no-new-null
					clientId: ClientConnectionId | null;
				}
			> &
				UnverifiedBrand<TMessage>
		: never;

/**
 * Verified incoming extension signals.
 *
 * @sealed
 * @internal
 */
export type VerifiedInboundExtensionMessage<TMessage extends TypedMessage = TypedMessage> =
	// `TMessage extends TypedMessage` encourages processing union elements individually
	TMessage extends TypedMessage
		? InternalUtilityTypes.FlattenIntersection<
				ExtensionMessage<{
					type: TMessage["type"];
					content: JsonDeserialized<TMessage["content"]>;
				}> & {
					/**
					 * The client ID that submitted the message.
					 * For server generated messages the clientId will be null.
					 */
					// eslint-disable-next-line @rushstack/no-new-null
					clientId: ClientConnectionId | null;
				}
			>
		: never;

/**
 * Incoming extension signal that may be of the known type or has not yet been validated.
 *
 * @sealed
 * @internal
 */
export type InboundExtensionMessage<TMessage extends TypedMessage = TypedMessage> =
	| RawInboundExtensionMessage<TMessage>
	| VerifiedInboundExtensionMessage<TMessage>;

/**
 * @internal
 */
export interface ExtensionRuntimeProperties {
	SignalMessages: TypedMessage;
}

/**
 * Defines requirements for a component to register with container as an extension.
 *
 * @internal
 */
export interface ContainerExtension<
	TUseContext extends unknown[],
	TRuntimeProperties extends ExtensionRuntimeProperties,
> {
	/**
	 * Notifies the extension of a new use context.
	 *
	 * @param context - Context new reference to extension is acquired within
	 */
	onNewContext(...context: TUseContext): void;

	/**
	 * Callback for signal sent by this extension.
	 *
	 * @param address - Address of the signal
	 * @param signalMessage - Signal unverified content and metadata
	 * @param local - True if signal was sent by this client
	 *
	 */
	processSignal?: (
		address: string,
		signalMessage: InboundExtensionMessage<TRuntimeProperties["SignalMessages"]>,
		local: boolean,
	) => void;
}

/**
 * Events emitted by the {@link ExtensionRuntime}.
 *
 * @internal
 */
export interface ExtensionRuntimeEvents {
	"disconnected": () => void;
	"connected": (clientId: ClientConnectionId) => void;
}

/**
 * Defines the runtime interface an extension may access.
 * In most cases this is a logical subset of {@link @fluidframework/container-runtime-definitions#IContainerRuntime}.
 *
 * @sealed
 * @internal
 */
export interface ExtensionRuntime<TRuntimeProperties extends ExtensionRuntimeProperties> {
	readonly isConnected: () => boolean;
	readonly getClientId: () => ClientConnectionId | undefined;

	readonly events: Listenable<ExtensionRuntimeEvents>;

	readonly logger: ITelemetryBaseLogger;

	/**
	 * Submits a signal to be sent to other clients.
	 * @param address - Custom address for the signal.
	 * @param message - Custom message content of the signal.
	 *
	 * Upon receipt of signal, {@link ContainerExtension.processSignal} will be called with the same
	 * address and message (less any non-{@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify|JSON.stringify}-able data).
	 */
	submitAddressedSignal: (
		address: string,
		message: OutboundExtensionMessage<TRuntimeProperties["SignalMessages"]>,
	) => void;

	/**
	 * The collection of write clients which were connected as of the current sequence number.
	 * Also contains a map of key-value pairs that must be agreed upon by all clients before being accepted.
	 */
	getQuorum: () => IQuorumClients;
	getAudience: () => IAudience;
}

/**
 * Factory method to create an extension instance.
 *
 * Any such method provided to {@link ContainerExtensionStore.acquireExtension}
 * must use the same value for a given {@link ContainerExtensionId} so that an
 * `instanceof` check may be performed at runtime.
 *
 * @typeParam T - Type of extension to create
 * @typeParam TContext - Array of optional custom context
 *
 * @param runtime - Runtime for extension to work against
 * @param context - Custom context for extension.
 * @returns Record providing:
 * `interface` instance (type `T`) that is provided to caller of
 * {@link ContainerExtensionStore.acquireExtension} and
 * `extension` store/runtime uses to interact with extension.
 *
 * @internal
 */
export type ContainerExtensionFactory<
	T,
	TUseContext extends unknown[],
	TRuntimeProperties extends ExtensionRuntimeProperties,
> = new (
	runtime: ExtensionRuntime<TRuntimeProperties>,
	...context: TUseContext
) => {
	readonly interface: T;
	readonly extension: ContainerExtension<TUseContext, TRuntimeProperties>;
};

/**
 * Unique identifier for extension
 *
 * @remarks
 * A string known to all clients working with a certain ContainerExtension and unique
 * among ContainerExtensions. Not `/` may be used in the string. Recommend using
 * concatenation of: type of unique identifier, `:` (required), and unique identifier.
 *
 * @example Examples
 * ```typescript
 *   "guid:g0fl001d-1415-5000-c00l-g0fa54g0b1g1"
 *   "name:@foo-scope_bar:v1"
 * ```
 *
 * @internal
 */
export type ContainerExtensionId = `${string}:${string}`;

/**
 * @sealed
 * @internal
 */
export interface ContainerExtensionStore {
	/**
	 * Acquires an extension from store or adds new one.
	 *
	 * @param id - Identifier for the requested extension
	 * @param factory - Factory to create the extension if not found
	 * @returns The extension
	 */
	acquireExtension<
		T,
		TUseContext extends unknown[],
		TRuntimeProperties extends ExtensionRuntimeProperties,
	>(
		id: ContainerExtensionId,
		factory: ContainerExtensionFactory<T, TUseContext, TRuntimeProperties>,
		...context: TUseContext
	): T;
}
