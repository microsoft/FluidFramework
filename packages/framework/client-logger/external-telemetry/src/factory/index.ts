/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerTelemetryManager } from "../container/index.js";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer.js";
import { type ITelemetryConsumer } from "../common/index.js";
import type { IFluidContainer } from "@fluidframework/fluid-static";

/**
 * Configuration object for subscribing to {@link IExternalTelemetry} and consuming said telemetry via one or more {@link ITelemetryConsumer}
 *
 * @beta
 */
export interface TelemetryConfig {
	/**
	 * The container whose events should be monitored, transformed into external telemetry, and sent to a {@link ITelemetryConsumer}.
	 */
	container: IFluidContainer;
	/**
	 * Unique identifier for a container, stable across creation and load.
	 * I.e. different clients loading the same container (or the same client loading the container two separate times)
	 * will agree on this value.
	 */
	containerId: string;
	/**
	 * Conusmers take incoming produced {@link IExternalTelemetry} and do something of your choice with it.
	 * This could be sending the telemetry to a cloud platform or just console logging.
	 */
	consumers: ITelemetryConsumer[];
}

/**
 * Starts creating {@link IExternalTelemetry} by transforming raw system events emitted by the specified container
 * into said telemetry and passing it onto to the specified {@link ITelemetryConsumer}
 *
 * @beta
 */
export const startTelemetry = (config: TelemetryConfig): void => {
	if (config.container) {
		const telemetryProducer = new ContainerEventTelemetryProducer(config.containerId);
		new ContainerTelemetryManager(config.container, telemetryProducer, config.consumers);
	} else {
		throw new Error("A Fluid Container must be provided for telemetry");
	}
};
