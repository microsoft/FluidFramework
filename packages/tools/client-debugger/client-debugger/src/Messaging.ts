/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Differentiate inbound vs outbound message kinds (from the perspective of this library)

/**
 * Message structure expected for window event listeners used by the Fluid Client Debugger.
 *
 * @public
 */
export interface IDebuggerMessage {
	type?: string;
	data?: unknown;
}

/**
 * Message structure used in window messages *received* by the Fluid Client Debugger.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IInboundMessage extends IDebuggerMessage {}

/**
 * Message structure used in window messages *sent* by the Fluid Client Debugger.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IOutboundMessage extends IDebuggerMessage {}

/**
 * Outbound event indicating a change in the debugger registry (i.e. a debugger has been registered or closed).
 * Includes the new list of active debugger Container IDs.
 *
 * @privateRemarks TODO: do we want separate on-add / on-remove events (let subscribers manage their own lists)?
 *
 * @public
 */
export interface RegistryChangeMessage extends IOutboundMessage {
	type: "REGISTRY_CHANGE";
	data: {
		containerIds: string[];
	};
}

/**
 * Posts the provided message to the window (globalThis).
 *
 * @remarks Thin wrapper to provide some message-wise type-safety.
 */
export function postWindowMessage<TMessage extends IOutboundMessage>(message: TMessage): void {
	globalThis.postMessage(message, "*"); // TODO: verify target is okay
}
