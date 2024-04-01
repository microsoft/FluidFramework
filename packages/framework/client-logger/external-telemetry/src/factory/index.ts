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
 * Config object forsubscribing to external telemetry covering differents scopes of the Fluid Framework
 *
 * @beta
 */
export interface TelemetryConfig {
	/**
	 * By providing this attribute, container related external telemetry will be send to any provided ITelemetryConsumer(s)
	 */
	container: IFluidContainer;
	/**
	 * Consumers for produced external telemetry.
	 */
	consumers: ITelemetryConsumer[];
}

/**
 * Creates an external telemetry consumer that will send telemetry to Azure Application Insights
 *
 * @param client - An instance of an Azure Application Insights client {@link @microsoft/applicationinsights-web#ApplicationInsights}
 * The App Insights instance must be initialed before being provided which can be done via {@link @microsoft/applicationinsights-web#ApplicationInsights.loadAppInsights}
 * `applicationInsightsClient.loadAppInsights(); `
 *
 * @beta
 */
export const createAppInsightsTelemetryConsumer = (
	client: ApplicationInsights,
): ITelemetryConsumer => {
	return new AppInsightsTelemetryConsumer(client);
};

/**
 * Starts subscribing to external telemetry for one or more areas of the Fluid Framework.
 * @beta
 */
export const subscribeToTelemetry = (config: TelemetryConfig): void => {
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
