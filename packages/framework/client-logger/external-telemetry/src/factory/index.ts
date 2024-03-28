/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerTelemetryManager } from "../container/index.js";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer.js";
import type { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { AppInsightsTelemetryConsumer, type ITelemetryConsumer } from "../common/index.js";

/**
 * Config object for creating one or more telemetry managers covering differents scopes of the Fluid Framework
 *
 * @beta
 */
export interface TelemetryManagerConfig {
	/**
	 * By providing this attribute, container related external telemetry will be send to any provided ITelemetryConsumer(s)
	 */
	container: IContainer;
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
 * Starts external telemetry managers for one or more areas of the Fluid Framework.
 * @beta
 */
export const startTelemetryManagers = (config: TelemetryManagerConfig): void => {
	if (config.container) {
		const telemetryProducer = new ContainerEventTelemetryProducer(config.container);
		new ContainerTelemetryManager(config.container, telemetryProducer, config.consumers);
	}
};
