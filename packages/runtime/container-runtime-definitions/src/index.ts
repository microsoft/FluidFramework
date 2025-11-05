/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Re-export selected types from runtime-definitions internal module
// that are core to more complete container runtime extensions types
// maintained here.
export type {
	ContainerExtensionId,
	ExtensionCompatibilityDetails,
} from "@fluidframework/runtime-definitions/internal";
export type {
	ClientConnectionId,
	ContainerExtensionFactory,
	ContainerExtensionStore,
	ContainerExtension,
	ExtensionHost,
	ExtensionHostEvents,
	ExtensionInstantiationResult,
	ExtensionMessage,
	ExtensionRuntimeProperties,
	InboundExtensionMessage,
	JoinedStatus,
	JoinedStatus_disconnected,
	JoinedStatus_joinedForReading,
	JoinedStatus_joinedForWriting,
	OutboundExtensionMessage,
	RawInboundExtensionMessage,
	UnverifiedBrand,
	VerifiedInboundExtensionMessage,
} from "./containerExtension.js";
export type {
	IContainerRuntime,
	IContainerRuntimeBaseWithCombinedEvents,
	IContainerRuntimeEvents,
	IContainerRuntimeInternal,
	IContainerRuntimeWithResolveHandle_Deprecated,
	SummarizerStopReason,
	ISummarizeEventProps,
	ISummarizerObservabilityProps,
	ISummarizerEvents,
} from "./containerRuntime.js";
