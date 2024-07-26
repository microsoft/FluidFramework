/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal";

/**
 * While connected the id of a client within a session.
 *
 * @internal
 */
export type ClientConnectionId = string;

/**
 * Common interface between incoming and outgoing signals.
 *
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
 * @sealed
 * @internal
 */
export interface IExtensionRuntime {
	get clientId(): ClientConnectionId | undefined;
	submitSignal<T>(
		address: string,
		type: string,
		content: JsonSerializable<T>,
		targetClientId?: ClientConnectionId,
	): void;
}

/**
 * @internal
 */
export type ContainerExtensionFactory<T, TContext extends unknown[]> = new (
	runtime: IExtensionRuntime,
	...context: TContext
) => { readonly extension: T; readonly interface: IContainerExtension<TContext> };

/**
 * Unique identifier for extension
 *
 * @remarks
 * A string known to all clients working with a certain ContainerExtension and unique
 * among ContainerExtensions. Recommend using specifying concatenation of: type of
 * unique identifier, `:` (required), and unique identifier.
 *
 * @example Examples
 * ```typescript
 *   "guid:g0fl001d-1415-5000-c00l-g0fa54g0b1g1"
 *   "@foo-cope/bar:v1"
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
