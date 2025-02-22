/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

/**
 * While connected, the id of a client within a session.
 *
 * @internal
 */
export type ClientConnectionId = string;

/**
 * Common interface between incoming and outgoing extension signals.
 *
 * @sealed
 * @internal
 */
export interface IExtensionMessage<TType extends string = string, TContent = unknown> {
	/**
	 * Message type
	 */
	type: TType;

	/**
	 * Message content
	 */
	content: JsonDeserialized<TContent>;

	/**
	 * The client ID that submitted the message.
	 * For server generated messages the clientId will be null.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	clientId: ClientConnectionId | null;

	/**
	 * Client ID of the singular client the message is being (or has been) sent to.
	 * May only be specified when IConnect.supportedFeatures['submit_signals_v2'] is true, will throw otherwise.
	 */
	targetClientId?: ClientConnectionId;
}

/**
 * Defines requirements for a component to register with container as an extension.
 *
 * @internal
 */
export interface IContainerExtension<TContext extends unknown[]> {
	/**
	 * Notifies the extension of a new use context.
	 *
	 * @param context - Context new reference to extension is acquired within
	 */
	onNewContext(...context: TContext): void;

	/**
	 * Callback for signal sent by this extension.
	 *
	 * @param address - Address of the signal
	 * @param signal - Signal content and metadata
	 * @param local - True if signal was sent by this client
	 */
	processSignal?(address: string, signal: IExtensionMessage, local: boolean): void;
}

/**
 * Defines the runtime interface an extension may access.
 * In most cases this is a subset of {@link @fluidframework/container-runtime-definitions#IContainerRuntime}.
 *
 * @sealed
 * @internal
 */
export interface IExtensionRuntime {
	/**
	 * {@inheritdoc @fluidframework/container-runtime-definitions#IContainerRuntime.clientId}
	 */
	get clientId(): ClientConnectionId | undefined;

	/**
	 * Submits a signal to be sent to other clients.
	 * @param address - Custom address for the signal.
	 * @param type - Custom type of the signal.
	 * @param content - Custom content of the signal. Should be a JSON serializable object or primitive via {@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify|JSON.stringify}.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 *
	 * Upon receipt of signal, {@link IContainerExtension.processSignal} will be called with the same
	 * address, type, and content (less any non-{@link https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify|JSON.stringify}-able data).
	 */
	submitAddressedSignal<T>(
		address: string,
		type: string,
		content: JsonSerializable<T>,
		targetClientId?: ClientConnectionId,
	): void;
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
export type ContainerExtensionFactory<T, TContext extends unknown[]> = new (
	runtime: IExtensionRuntime,
	...context: TContext
) => { readonly interface: T; readonly extension: IContainerExtension<TContext> };

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
	acquireExtension<T, TContext extends unknown[]>(
		id: ContainerExtensionId,
		factory: ContainerExtensionFactory<T, TContext>,
		...context: TContext
	): T;
}
