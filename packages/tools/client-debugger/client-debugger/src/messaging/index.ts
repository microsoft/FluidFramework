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
	ConnectContainerMessageType,
	DisconnectContainerMessage,
	DisconnectContainerMessageData,
	DisconnectContainerMessageType,
	CloseContainerMessage,
	CloseContainerMessageData,
	CloseContainerMessageType,
	ContainerStateChangeMessage,
	ContainerStateChangeMessageData,
	ContainerStateChangeMessageType,
	ContainerStateHistoryMessage,
	ContainerStateHistoryMessageData,
	ContainerStateHistoryMessageType,
	DataVisualizationMessage,
	DataVisualizationMessageData,
	DataVisualizationMessageType,
	GetContainerStateMessage,
	GetContainerStateMessageData,
	GetContainerStateMessageType,
	GetDataVisualizationMessage,
	GetDataVisualizationMessageData,
	GetDataVisualizationMessageType,
	GetRootDataVisualizationsMessage,
	GetRootDataVisualizationsMessageData,
	GetRootDataVisualizationsMessageType,
	RootDataVisualizationsMessage,
	RootDataVisualizationsMessageData,
	RootDataVisualizationsMessageType,
} from "./DebuggerMessages";
export { ISourcedDebuggerMessage, IDebuggerMessage } from "./Messages";
export { IMessageRelay, IMessageRelayEvents } from "./MessageRelay";
export {
	GetContainerListMessage,
	GetContainerListMessageType,
	RegistryChangeMessage,
	RegistryChangeMessageData,
	RegistryChangeMessageType,
} from "./RegistryMessages";
export {
	AudienceClientMetadata,
	AudienceSummaryMessage,
	AudienceSummaryMessageData,
	AudienceSummaryMessageType,
	GetAudienceMessage,
	GetAudienceMessageType,
} from "./AudienceMessages";
export {
	GetTelemetryHistoryMessage,
	GetTelemetryHistoryMessageType,
	ITimestampedTelemetryEvent,
	TelemetryEventMessage,
	TelemetryEventMessageData,
	TelemetryEventMessageType,
	TelemetryHistoryMessage,
	TelemetryHistoryMessageType,
} from "./TelemetryMessages";
export {
	handleIncomingMessage,
	handleIncomingWindowMessage,
	InboundHandlers,
	isDebuggerMessage,
	MessageLoggingOptions,
	postMessagesToWindow,
} from "./Utilities";
