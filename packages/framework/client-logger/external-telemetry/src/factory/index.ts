/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions";
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
	container?: IFluidContainer;
	/**
	 * Consumers for produced external telemetry.
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
		const fluidContainer = config.container as {
			INTERNAL_CONTAINER_DO_NOT_USE?: () => IContainer;
		};

		if (fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE === undefined) {
			console.error("Missing Container accessor on FluidContainer.");
		} else {
			const innerContainer = fluidContainer.INTERNAL_CONTAINER_DO_NOT_USE();
			const telemetryProducer = new ContainerEventTelemetryProducer(innerContainer);
			new ContainerTelemetryManager(innerContainer, telemetryProducer, config.consumers);
		}
	} else {
		throw new Error("A Fluid Container must be provided for telemetry");
	}
};
