/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * TODO
 *
 * @remarks
 *
 * TODO: Update this
 *
 * The general usage pattern for this library is to first initialize a debugger for a given Fluid Client
 * ({@link @fluidframework/container-definitions#IContainer} and {@link @fluidframework/container-definitions#IAudience})
 * by calling {@link initializeDevtools} during application setup / any time after your container has been
 * attached.
 *
 * The Devtools instance will automatically dispose of itself as a part of the Window's unload operation
 * (when the page is closed, refreshed, etc.).
 * That said, if you wish to manually close the Devtools at some earlier stage in your application lifecycle, you may call {@link closeDevtools} to do so.
 *
 * @example Initialization
 *
 * TODO: Update this
 *
 * ```typescript
 * initializeDevtools({
 *  containerId,
 *  container,
 *  containerData: {
 *      rootMap: sharedMap
 *  },
 * });
 * ```
 *
 * @example Disposal
 *
 * TODO: Update this
 *
 * ```typescript
 * closeDevtools(containerId);
 * ```
 *
 * @packageDocumentation
 */

export { AudienceClientMetadata, MemberChangeKind } from "./AudienceMetadata";
export { FluidObjectId, HasContainerId, HasFluidObjectId } from "./CommonInterfaces";
export { ContainerStateChangeKind } from "./Container";
export { ContainerDevtoolsProps } from "./ContainerDevtools";
export { ContainerMetadata, ContainerStateMetadata } from "./ContainerMetadata";
export {
	FluidHandleNode,
	FluidObjectNode,
	FluidObjectNodeBase,
	FluidObjectTreeNode,
	FluidObjectValueNode,
	FluidUnknownObjectNode,
	Primitive,
	RootHandleNode,
	TreeNodeBase,
	ValueNodeBase,
	VisualChildNode,
	VisualNode,
	VisualNodeBase,
	VisualNodeKind,
	VisualTreeNode,
	VisualValueNode,
	VisualizeChildData,
	VisualizeSharedObject,
	UnknownObjectNode,
} from "./data-visualization";
export {
	ContainerDevtoolsFeature,
	ContainerDevtoolsFeatureFlags,
	DevtoolsFeature,
	DevtoolsFeatureFlags,
} from "./Features";
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
	DataVisualization,
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
	postMessagesToWindow,
	RootDataVisualizations,
	TelemetryEvent,
	TelemetryHistory,
} from "./messaging";
export { ITimestampedTelemetryEvent } from "./TelemetryMetadata";
