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

export { devtoolsMessageSource } from "./Constants";
export {
	CloseContainer,
	ConnectContainer,
	ContainerStateChange,
	ContainerStateHistory,
	DataVisualization,
	DisconnectContainer,
	GetContainerState,
	GetDataVisualization,
	GetRootDataVisualizations,
	RootDataVisualizations,
} from "./container-devtools-messages";
export { ISourcedDebuggerMessage, IDebuggerMessage } from "./Messages";
export { IMessageRelay, IMessageRelayEvents } from "./MessageRelay";
export {
	GetContainerListMessage,
	GetContainerListMessageType,
	ContainerListMessage,
	ContainerListMessageData,
	ContainerListMessageType,
} from "./DevtoolsMessages";
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
