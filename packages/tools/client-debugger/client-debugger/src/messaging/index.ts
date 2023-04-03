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
	HasFluidObjectId,
	ConnectContainerMessage,
	ConnectContainerMessageData,
	DisconnectContainerMessage,
	DisconnectContainerMessageData,
	CloseContainerMessage,
	CloseContainerMessageData,
	ContainerStateChangeMessage,
	ContainerStateChangeMessageData,
	ContainerStateHistoryMessage,
	ContainerStateHistoryMessageData,
	DataVisualizationMessage,
	DataVisualizationMessageData,
	GetContainerStateMessage,
	GetContainerStateMessageData,
	GetDataVisualizationMessage,
	GetDataVisualizationMessageData,
	GetRootDataVisualizationsMessage,
	GetRootDataVisualizationsMessageData,
	RootDataVisualizationsMessage,
	RootDataVisualizationsMessageData,
} from "./DebuggerMessages";
export { ISourcedDebuggerMessage, IDebuggerMessage } from "./Messages";
export { IMessageRelay, IMessageRelayEvents } from "./MessageRelay";
export {
	GetContainerListMessage,
	RegistryChangeMessage,
	RegistryChangeMessageData,
} from "./RegistryMessages";
export {
	GetAudienceMessage,
	AudienceClientMetaData,
	AudienceSummaryMessageData,
	AudienceSummaryMessage,
} from "./AudienceMessages";
export {
	ITimestampedTelemetryEvent,
	TelemetryHistoryMessage,
	GetTelemetryHistoryMessage,
	TelemetryEventMessage,
	TelemetryEventMessageData,
} from "./TelemetryMessages";
export {
	handleIncomingMessage,
	handleIncomingWindowMessage,
	InboundHandlers,
	isDebuggerMessage,
	MessageLoggingOptions,
	postMessagesToWindow,
} from "./Utilities";
