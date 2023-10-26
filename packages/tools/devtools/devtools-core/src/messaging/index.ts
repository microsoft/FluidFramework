/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODOs:
// - Better documentation terminology WRT "inbound" vs "outbound" events.
//   - Since the types and utilities are re-used between the packages, these should be documented in
//     explicit terms of the devtools to/from external consumer.

/**
 * This directory contains types and utilities for use in window-based messaging, used
 * by the Fluid Devtools.
 */

export { devtoolsMessageSource } from "./Constants";
export {
	AudienceSummary,
	CloseContainer,
	ConnectContainer,
	ContainerDevtoolsFeatures,
	ContainerStateChange,
	ContainerStateHistory,
	DataEdit,
	DataVisualization,
	DisconnectContainer,
	GetAudienceSummary,
	GetContainerDevtoolsFeatures,
	GetContainerState,
	GetDataVisualization,
	GetRootDataVisualizations,
	RootDataVisualizations,
} from "./container-devtools-messages";
export {
	ContainerList,
	DevtoolsDisposed,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
} from "./devtools-messages";
export type { ISourcedDevtoolsMessage, IDevtoolsMessage } from "./Messages";
export type { IMessageRelay, IMessageRelayEvents } from "./MessageRelay";
export { GetTelemetryHistory, TelemetryEvent, TelemetryHistory } from "./telemetry-messages";
export type { InboundHandlers, MessageLoggingOptions } from "./Utilities";
export {
	handleIncomingMessage,
	handleIncomingWindowMessage,
	isDevtoolsMessage,
	postMessagesToWindow,
} from "./Utilities";
