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

export { devtoolsMessageSource } from "./Constants.js";
export {
	AudienceSummary,
	CloseContainer,
	ConnectContainer,
	ContainerDevtoolsFeatures,
	ContainerStateChange,
	ContainerStateHistory,
	DataVisualization,
	DisconnectContainer,
	GetAudienceSummary,
	GetContainerDevtoolsFeatures,
	GetContainerState,
	GetDataVisualization,
	GetRootDataVisualizations,
	RootDataVisualizations,
} from "./container-devtools-messages/index.js";
export {
	ContainerList,
	DevtoolsDisposed,
	DevtoolsFeatures,
	GetContainerList,
	GetDevtoolsFeatures,
	SetUnsampledTelemetry,
} from "./devtools-messages/index.js";
export type { ISourcedDevtoolsMessage, IDevtoolsMessage } from "./Messages.js";
export type { IMessageRelay, IMessageRelayEvents } from "./MessageRelay.js";
export {
	GetTelemetryHistory,
	TelemetryEvent,
	TelemetryHistory,
} from "./telemetry-messages/index.js";
export type { InboundHandlers, MessageLoggingOptions } from "./Utilities.js";
export {
	handleIncomingMessage,
	handleIncomingWindowMessage,
	isDevtoolsMessage,
	postMessagesToWindow,
} from "./Utilities.js";
