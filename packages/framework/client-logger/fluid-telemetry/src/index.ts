/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This package provides an implementation and types for producing and consuming telemetry for Fluid Framework applications
 * @packageDocumentation
 */
export { type ICriticalContainerError } from "@fluidframework/container-definitions";

export { AppInsightsTelemetryConsumer } from "./app-insights/index.js";
export {
	type FluidTelemetryEventName,
	type IFluidTelemetry,
	type ITelemetryConsumer,
} from "./common/index.js";
export {
	type ContainerConnectedTelemetry,
	type ContainerDisconnectedTelemetry,
	type ContainerDisposedTelemetry,
	type ContainerTelemetryEventName,
	ContainerTelemetryEventNames,
	type IContainerTelemetry,
} from "./container/index.js";
export { type TelemetryConfig, startTelemetry } from "./factory/index.js";
