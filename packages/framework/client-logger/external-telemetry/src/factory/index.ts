/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerTelemetryManager } from "../container/index.js";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer.js";
import type { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { AppInsightsTelemetryConsumer, type ITelemetryConsumer } from "../common/index.js";
import type { IFluidContainer } from "@fluidframework/fluid-static";

/**
 * Configuration object for subscribing to {@link IExternalTelemetry} and consuming said telemetry via one or more {@link ITelemetryConsumer}
 *
 * @beta
 */
export interface TelemetryConfig {
	/**
	 * The container whose events should be monitored, transformed into external telemetry, and send to an {@link ITelemetryConsumer}.
	 */
	container?: IFluidContainer;
	/**
	 * Consumers for produced external telemetry.
	 */
	consumers: ITelemetryConsumer[];
}

/**
 * Creates an external telemetry consumer that will send telemetry to Azure Application Insights
 *
 * @param client - An instance of an Azure Application Insights client {@link @microsoft/applicationinsights-web#ApplicationInsights}
 * The App Insights instance must be initialized before being provided, which can be done via {@link @microsoft/applicationinsights-web#ApplicationInsights.loadAppInsights }
 *
 * @beta
 */
export const createAppInsightsTelemetryConsumer = (
	client: ApplicationInsights,
): ITelemetryConsumer => {
	return new AppInsightsTelemetryConsumer(client);
};

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
