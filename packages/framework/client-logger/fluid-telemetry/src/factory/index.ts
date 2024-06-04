/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidContainer } from "@fluidframework/fluid-static";

import { type ITelemetryConsumer } from "../common/index.js";
import { ContainerTelemetryManager, ContainerEventTelemetryProducer } from "../container/index.js";

/**
 * Configuration object for subscribing to {@link @fluidframework/fluid-telemetry#IFluidTelemetry} and consuming said telemetry via one or more {@link ITelemetryConsumer}
 *
 * @beta
 */
export interface TelemetryConfig {
	/**
	 * The container whose events should be monitored, transformed into Fluid telemetry, and sent to a {@link ITelemetryConsumer}.
	 */
	container: IFluidContainer;
	/**
	 * Unique identifier for the passed in container, i.e. the return value of a call
	 * to {@link @fluidframework/fluid-static#IFluidContainer.attach | `IFluidContainer.attach()`} when creating a new
	 * Fluid container, or the id used to load a pre-existing one.
	 */
	containerId: string;
	/**
	 * Conusmers take incoming produced {@link @fluidframework/fluid-telemetry#IFluidTelemetry} and do something of your choice with it.
	 * This could be sending the telemetry to a cloud platform or just console logging.
	 */
	consumers: ITelemetryConsumer[];
}

/**
 * Starts creating {@link @fluidframework/fluid-telemetry#IFluidTelemetry} by transforming raw system events emitted by the specified container
 * into said telemetry and passing it onto to the specified {@link ITelemetryConsumer}
 *
 * @beta
 */
export const startTelemetry = (config: TelemetryConfig): void => {
	const telemetryProducer = new ContainerEventTelemetryProducer(config.containerId);
	new ContainerTelemetryManager(config.container, telemetryProducer, config.consumers);
};
