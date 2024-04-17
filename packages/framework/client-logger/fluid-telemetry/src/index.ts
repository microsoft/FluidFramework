/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This package provides an implementation and types for producing and consuming telemetry for Fluid Framework applications
 * @packageDocumentation
 */
export { type ICriticalContainerError } from "@fluidframework/container-definitions";
export {
	type IFluidTelemetry,
	type FluidTelemetryEventName,
	type ITelemetryConsumer,
} from "./common/index.js";
export {
	type IContainerTelemetry,
	type ContainerTelemetryEventName,
	ContainerTelemetryEventNames,
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type ContainerDisposedTelemetry,
} from "./container/index.js";
export { AppInsightsTelemetryConsumer } from "./app-insights/index.js";
export { startTelemetry, type TelemetryConfig } from "./factory/index.js";
