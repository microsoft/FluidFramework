/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains an API for initializing developer tooling alongside the Fluid Framework.
 *
 * This tooling is built for use alongside our Chromium browser extension.
 * It listens for incoming messages from the corresponding extension, and posts direct responses as well as automatic
 * updates for Fluid state changes.
 *
 * Individual {@link @fluidframework/container-definitions#IContainer | Fluid Containers} can be registered to generate
 * Container-level stats.
 *
 * Visualization of telemetry logs can be enabled by creating a {@link DevtoolsLogger} and providing it to Devtools
 * initialization.
 *
 * See the package README for more details.
 *
 * @packageDocumentation
 */

export type { AudienceClientMetadata } from "./AudienceMetadata.js";
export { MemberChangeKind } from "./AudienceMetadata.js";
export type {
	ContainerKey,
	FluidObjectId,
	HasContainerKey,
	HasFluidObjectId,
} from "./CommonInterfaces.js";
export { EditType } from "./CommonInterfaces.js";
export { ContainerStateChangeKind } from "./Container.js";
export type { ContainerDevtoolsProps } from "./ContainerDevtools.js";
export type { ContainerStateMetadata } from "./ContainerMetadata.js";
export type { ContainerRuntimeProps } from "./ContainerRuntimeDevtools.js";
export { type IDevtoolsLogger, createDevtoolsLogger } from "./DevtoolsLogger.js";
export type {
	FluidHandleNode,
	FluidObjectNode,
	FluidObjectNodeBase,
	FluidObjectTreeNode,
	FluidObjectValueNode,
	FluidUnknownObjectNode,
	Primitive,
	RootHandleNode,
	TreeNodeBase,
	UnknownObjectNode,
	ValueNodeBase,
	VisualChildNode,
	VisualNode,
	VisualNodeBase,
	VisualTreeNode,
	VisualValueNode,
} from "./data-visualization/index.js";
export { VisualNodeKind } from "./data-visualization/index.js";
export type { ContainerDevtoolsFeatureFlags, DevtoolsFeatureFlags } from "./Features.js";
export type { FluidDevtoolsProps } from "./FluidDevtools.js";
export { initializeDevtools, tryGetFluidDevtools } from "./FluidDevtools.js";
export type { IFluidDevtools } from "./IFluidDevtools.js";
export type {
	AudienceChangeLogEntry,
	ConnectionStateChangeLogEntry,
	LogEntry,
	StateChangeLogEntry,
} from "./Logs.js";
export type {
	IDevtoolsMessage,
	IMessageRelay,
	IMessageRelayEvents,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	MessageLoggingOptions,
} from "./messaging/index.js";
export {
	AudienceSummary,
	CloseContainer,
	ConnectContainer,
	ContainerDevtoolsFeatures,
	ContainerList,
	ContainerStateChange,
	ContainerStateHistory,
	DataVisualization,
	DevtoolsDisposed,
	DevtoolsFeatures,
	DisconnectContainer,
	GetAudienceSummary,
	GetContainerDevtoolsFeatures,
	GetContainerList,
	GetContainerState,
	GetDataVisualization,
	GetDevtoolsFeatures,
	GetRootDataVisualizations,
	GetTelemetryHistory,
	RootDataVisualizations,
	SetUnsampledTelemetry,
	TelemetryEvent,
	TelemetryHistory,
	devtoolsMessageSource,
	handleIncomingMessage,
	handleIncomingWindowMessage,
	isDevtoolsMessage,
} from "./messaging/index.js";
export type { ITimestampedTelemetryEvent } from "./TelemetryMetadata.js";
