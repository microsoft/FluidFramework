/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILayerCompatDetails } from "@fluid-internal/client-utils";
import type { IAudience } from "@fluidframework/container-definitions/internal";
import type {
	BrandedType,
	InternalUtilityTypes,
	ITelemetryBaseLogger,
	JsonDeserialized,
	JsonSerializable,
	Listenable,
	OpaqueJsonDeserialized,
	TypedMessage,
} from "@fluidframework/core-interfaces/internal";
import type { IQuorumClients } from "@fluidframework/driver-definitions/internal";
import type {
	ContainerExtensionId,
	ContainerExtensionExpectations,
	ExtensionCompatibilityDetails,
	UnknownExtensionInstantiation,
} from "@fluidframework/runtime-definitions/internal";

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
 * @remarks
 * What element is unverified is left up to the user and should be
 * coordinated with and documented for associated logic.
 *
 * One type of unverified data is whether a `string` represents an identifier
 * known to the system, such as an email address. This unverified email address
 * could be represented as `string & UnverifiedBrand<EmailAddress>` where
 * `EmailAddress` is a branded type for email addresses, such as
 * `string & BrandedType<"EmailAddress">`.
 *
 * Another type of unverified data is particular structure of value where little
 * to no or weak structure is known. An example is data received over the
 * wire that is expected to be of a certain structure but has not yet been
 * verified.
 *
 * Usage where value (type `U`) is not yet verified to be type `T`:
 *
 * - Cast value of type `U` suspected/expected to be `T` but not verified (where
 * `T extends U`) to `UnverifiedBrand` using `as U & UnverifiedBrand<T>`. An
 * example base type `U` for an object is `Record<string, unknown>`.
 *
 * - When `T` value is needed, use narrowing type guards to check (preferred)
 * or cast from `UnverifiedBrand` using `as unknown` when "instance" must
 * be parsed to `T`.
 *
 * @example Example narrowing type guard:
 * ```typescript
 * function validateFoo(
 *   unverified: Foo | (Record<string, unknown> & UnverifiedBrand<Foo>)
 * ): unverified is Foo {
 *   return unverified.IFooProvider === unverified;
 * }
 * ```
 *
 * @sealed
 * @internal
 */
export declare class UnverifiedBrand<T> extends BrandedType<UnverifiedBrand<unknown>> {
	protected readonly UnverifiedValue: T;
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
					content: OpaqueJsonDeserialized<unknown>;
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
					content: unknown extends TMessage["content"]
						? OpaqueJsonDeserialized<unknown>
						: JsonDeserialized<TMessage["content"]>;
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
 * Runtime properties of an extension.
 *
 * @remarks
 * This is used to coordinate select types that are known only to the extension, but
 * that host will respect where it calls back or provides extension specific data.
 *
 * @internal
 */
export interface ExtensionRuntimeProperties {
	SignalMessages: TypedMessage;
}

/**
 * Collection of properties resulting from instantiating an extension via its
 * factory.
 *
 * @remarks
 * All of the members are mutable to allow for handling version or capability
 * mismatches via replacement of interface or extension instances. That is the
 * only time mutation is expected to occur.
 *
 * @internal
 */
export interface ExtensionInstantiationResult<
	TInterface,
	TRuntimeProperties extends ExtensionRuntimeProperties,
	TUseContext extends unknown[],
> extends UnknownExtensionInstantiation {
	interface: TInterface;
	extension: ContainerExtension<TRuntimeProperties, TUseContext>;
}

/**
 * Defines requirements for a component to register with container as an extension.
 *
 * @internal
 */
export interface ContainerExtension<
	TRuntimeProperties extends ExtensionRuntimeProperties,
	TUseContext extends unknown[] = [],
> {
	/**
	 * Called when a new request is made for an extension with different version
	 * or capabilities than were registered for this extension instance.
	 *
	 * @typeParam TInterface - interface type of new request
	 *
	 * @param thisExistingInstantiation - registration of this extension in store
	 * @param newCompatibilityRequest - compatibility details of the new request
	 */
	handleVersionOrCapabilitiesMismatch<TRequestedInterface>(
		thisExistingInstantiation: Readonly<
			ExtensionInstantiationResult<unknown, TRuntimeProperties, TUseContext>
		>,
		newCompatibilityRequest: ExtensionCompatibilityDetails,
	): Readonly<
		ExtensionInstantiationResult<TRequestedInterface, TRuntimeProperties, TUseContext>
	>;

	/**
	 * Notifies the extension of a new use context.
	 *
	 * @param useContext - Context new reference to extension is acquired within.
	 *
	 * @remarks
	 * This is called when a secondary reference to the extension is acquired.
	 * useContext is the array of arguments that would otherwise be passed to
	 * the factory during first acquisition request.
	 */
	onNewUse(...useContext: TUseContext): void;

	/**
	 * Callback for signal sent by this extension.
	 *
	 * @param addressChain - Address chain of the signal
	 * @param signalMessage - Signal unverified content and metadata
	 * @param local - True if signal was sent by this client
	 *
	 */
	processSignal?: (
		addressChain: string[],
		signalMessage: InboundExtensionMessage<TRuntimeProperties["SignalMessages"]>,
		local: boolean,
	) => void;
}

// These are exported individual types as this is a type only package and does
// not support enums with runtime footprint.
/**
 * The container is not connected to the service.
 * @internal
 */
export type JoinedStatus_disconnected = "disconnected";
/**
 * The container has a connection and read-only operability.
 * @internal
 */
export type JoinedStatus_joinedForReading = "joinedForReading";
/**
 * The container has a connection and write operability.
 * @internal
 */
export type JoinedStatus_joinedForWriting = "joinedForWriting";

/**
 * Joined status for container.
 *
 * @remarks
 * May be:
 * - {@link JoinedStatus_disconnected|"disconnected"}
 * - {@link JoinedStatus_joinedForReading|"joinedForReading"}
 * - {@link JoinedStatus_joinedForWriting|"joinedForWriting"}
 *
 * @internal
 */
export type JoinedStatus =
	| JoinedStatus_disconnected
	| JoinedStatus_joinedForReading
	| JoinedStatus_joinedForWriting;

/**
 * Events emitted by the {@link ExtensionHost}.
 *
 * @remarks
 * With loaders prior to 2.52.0, readonly clients will not get joined status or events.
 * The only events emitted will be "joined" with canWrite = true and "disconnected".
 * @internal
 */
export interface ExtensionHostEvents {
	"disconnected": () => void;
	/**
	 * @privateRemarks There are no known listeners to this event. `presence`
	 * package listens to Signal-based Audience `addMember` event for self.
	 */
	"joined": (props: { clientId: ClientConnectionId; canWrite: boolean }) => void;
	/**
	 * @privateRemarks There are no known listeners to this event.
	 */
	"operabilityChanged": (canWrite: boolean) => void;
}

/**
 * Defines the runtime aspects an extension may access.
 *
 * @remarks
 * In most cases this is a logical subset of {@link @fluidframework/container-runtime-definitions#IContainerRuntime}.
 *
 * @sealed
 * @internal
 */
export interface ExtensionHost<TRuntimeProperties extends ExtensionRuntimeProperties> {
	/**
	 * Gets the current joined status of the container.
	 *
	 * @returns The current {@link JoinedStatus} of the container.
	 *
	 * @remarks
	 * Status changes are signaled through :
	 * - {@link ExtensionHostEvents.disconnected}: Transitioning to Disconnected state
	 * - {@link ExtensionHostEvents.joined}: Transition to CatchingUp or Connected state (either for reading or writing)
	 * - {@link ExtensionHostEvents.operabilityChanged}: When operability has changed (e.g., write to read)
	 */
	readonly getJoinedStatus: () => JoinedStatus;
	readonly getClientId: () => ClientConnectionId | undefined;

	readonly events: Listenable<ExtensionHostEvents>;

	readonly logger: ITelemetryBaseLogger;

	readonly supportedFeatures: ILayerCompatDetails["supportedFeatures"];

	/**
	 * Submits a signal to be sent to other clients.
	 * @param addressChain - Custom address sequence for the signal.
	 * @param message - Custom message content of the signal.
	 *
	 * Upon receipt of signal, {@link ContainerExtension.processSignal} will be called with the same
	 * address and message (less any non-{@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify|JSON.stringify}-able data).
	 */
	submitAddressedSignal: (
		addressChain: string[],
		message: OutboundExtensionMessage<TRuntimeProperties["SignalMessages"]>,
	) => void;

	/**
	 * The collection of write clients which were connected as of the current sequence number.
	 * Also contains a map of key-value pairs that must be agreed upon by all clients before being accepted.
	 */
	getQuorum: () => IQuorumClients;

	/**
	 * The collection of all clients as enumerated by the service.
	 *
	 * @remarks This may include/exclude those found within the quorum.
	 * It produces results faster than {@link ExtensionHost.getQuorum}, but
	 * will be inaccurate if any signals are lost.
	 */
	getAudience: () => IAudience;
}

/**
 * Factory method to create an extension instance.
 *
 * Any such method provided to {@link ContainerExtensionStore.acquireExtension}
 * must use the same value for a given {@link @fluidframework/runtime-definitions#ContainerExtensionId} so that an
 * `instanceof` check may be performed at runtime.
 *
 * @typeParam T - Type of extension to create
 * @typeParam TRuntimeProperties - Extension runtime properties
 * @typeParam TUseContext - Array of custom use context passed to factory or onNewUse
 *
 * @internal
 */
export interface ContainerExtensionFactory<
	TInterface,
	TRuntimeProperties extends ExtensionRuntimeProperties,
	TUseContext extends unknown[] = [],
> extends ContainerExtensionExpectations {
	resolvePriorInstantiation(
		priorInstantiation: UnknownExtensionInstantiation,
	): Readonly<ExtensionInstantiationResult<TInterface, TRuntimeProperties, TUseContext>>;

	/**
	 * @param host - Host runtime for extension to work against
	 * @param useContext - Custom use context for extension.
	 * @returns Record providing:
	 * `interface` instance (type `T`) that is provided to caller of
	 * {@link ContainerExtensionStore.acquireExtension} and
	 * `extension` store/runtime uses to interact with extension.
	 */
	instantiateExtension(
		host: ExtensionHost<TRuntimeProperties>,
		...useContext: TUseContext
	): ExtensionInstantiationResult<TInterface, TRuntimeProperties, TUseContext>;

	/**
	 * Determines if an `ExtensionInstantiationResult` came from `instantiateExtension`.
	 * Called by the semantics of the instanceof operator.
	 */
	[Symbol.hasInstance]: (
		instance: unknown,
	) => instance is ExtensionInstantiationResult<TInterface, TRuntimeProperties, TUseContext>;
}

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
	 * @param context - Custom use context for extension
	 * @returns The extension
	 */
	acquireExtension<
		TInterface,
		TRuntimeProperties extends ExtensionRuntimeProperties,
		TUseContext extends unknown[] = [],
	>(
		id: ContainerExtensionId,
		factory: ContainerExtensionFactory<TInterface, TRuntimeProperties, TUseContext>,
		...context: TUseContext
	): TInterface;
}
