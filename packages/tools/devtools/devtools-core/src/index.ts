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

export { AudienceClientMetadata, MemberChangeKind } from "./AudienceMetadata";
export {
	ContainerKey,
	EditType,
	FluidObjectId,
	HasContainerKey,
	HasFluidObjectId,
} from "./CommonInterfaces";
export { ContainerStateChangeKind } from "./Container";
export { ContainerDevtoolsProps } from "./ContainerDevtools";
export { ContainerStateMetadata } from "./ContainerMetadata";
export {
	Edit,
	EditData,
	EditSharedObject,
	FluidHandleNode,
	FluidObjectNode,
	FluidObjectNodeBase,
	FluidObjectTreeNode,
	FluidObjectValueNode,
	FluidUnknownObjectNode,
	Primitive,
	RootHandleNode,
	SharedObjectEdit,
	TreeNodeBase,
	ValueNodeBase,
	VisualChildNode,
	VisualNode,
	VisualNodeBase,
	VisualNodeKind,
	VisualTreeNode,
	VisualValueNode,
	UnknownObjectNode,
} from "./data-visualization";
export { ContainerDevtoolsFeatureFlags, DevtoolsFeatureFlags } from "./Features";
export { IFluidDevtools } from "./IFluidDevtools";
export { DevtoolsLogger } from "./DevtoolsLogger";
export { FluidDevtoolsProps, initializeDevtools } from "./FluidDevtools";
export {
	AudienceChangeLogEntry,
	ConnectionStateChangeLogEntry,
	LogEntry,
	StateChangeLogEntry,
} from "./Logs";
export {
	AudienceSummary,
	CloseContainer,
	ConnectContainer,
	ContainerDevtoolsFeatures,
	ContainerList,
	ContainerStateChange,
	ContainerStateHistory,
	DataEdit,
	DataVisualization,
	DevtoolsDisposed,
	DevtoolsFeatures,
	devtoolsMessageSource,
	DisconnectContainer,
	GetAudienceSummary,
	GetContainerDevtoolsFeatures,
	GetContainerList,
	GetContainerState,
	GetDataVisualization,
	GetDevtoolsFeatures,
	GetRootDataVisualizations,
	GetTelemetryHistory,
	IDevtoolsMessage,
	IMessageRelay,
	IMessageRelayEvents,
	ISourcedDevtoolsMessage,
	handleIncomingMessage,
	handleIncomingWindowMessage,
	InboundHandlers,
	isDevtoolsMessage,
	MessageLoggingOptions,
	RootDataVisualizations,
	TelemetryEvent,
	TelemetryHistory,
} from "./messaging";
export { ITimestampedTelemetryEvent } from "./TelemetryMetadata";
