/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Better documentation terminology WRT "inbound" vs "outbound" events.
//   - Since the types and utilities are re-used between the packages, these should be documented in
//     explicit terms of the debugger to/from external consumer.

/**
 * This directory contains types and utilities for use in window-based messaging, used
 * by the Fluid Client Debugger.
 */

export { debuggerMessageSource } from "./Constants";
export {
	HasContainerId,
	ContainerStateChangeMessage,
	ContainerStateChangeMessageData,
	GetContainerStateMessage,
	GetContainerStateMessageData,
} from "./DebuggerMessages";
export { IDebuggerMessage } from "./Messages";
export {
	GetContainerListMessage,
	RegistryChangeMessage,
	RegistryChangeMessageData,
} from "./RegistryMessages";
export {
	handleIncomingMessage,
	handleIncomingWindowMessage,
	InboundHandlers,
	isDebuggerMessage,
	MessageLoggingOptions,
	postMessageToWindow,
} from "./Utilities";
