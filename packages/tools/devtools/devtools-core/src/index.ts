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

export type { AudienceClientMetadata } from "./AudienceMetadata";
export { MemberChangeKind } from "./AudienceMetadata";
export type {
	ContainerKey,
	FluidObjectId,
	HasContainerKey,
	HasFluidObjectId,
} from "./CommonInterfaces";
export { EditType } from "./CommonInterfaces";
export { ContainerStateChangeKind } from "./Container";
export type { ContainerDevtoolsProps } from "./ContainerDevtools";
export type { ContainerStateMetadata } from "./ContainerMetadata";
export type {
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
	VisualTreeNode,
	VisualValueNode,
	UnknownObjectNode,
} from "./data-visualization";
export { VisualNodeKind } from "./data-visualization";
export type { ContainerDevtoolsFeatureFlags, DevtoolsFeatureFlags } from "./Features";
export type { IFluidDevtools } from "./IFluidDevtools";
export { createDevtoolsLogger, type IDevtoolsLogger } from "./DevtoolsLogger";
export type { FluidDevtoolsProps } from "./FluidDevtools";
export { initializeDevtools } from "./FluidDevtools";
export type {
	AudienceChangeLogEntry,
	ConnectionStateChangeLogEntry,
	LogEntry,
	StateChangeLogEntry,
} from "./Logs";
export type {
	IDevtoolsMessage,
	IMessageRelay,
	IMessageRelayEvents,
	ISourcedDevtoolsMessage,
	InboundHandlers,
	MessageLoggingOptions,
} from "./messaging";
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
	handleIncomingMessage,
	handleIncomingWindowMessage,
	isDevtoolsMessage,
	RootDataVisualizations,
	TelemetryEvent,
	TelemetryHistory,
} from "./messaging";
export type { ITimestampedTelemetryEvent } from "./TelemetryMetadata";
