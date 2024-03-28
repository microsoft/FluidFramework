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
	 * Configuration for creating an external telemetry manager for container related telemetry.
	 */
	containerTelemetry?: {
		container: IContainer;
	};
	/**
	 * Consumers for produced external telemetry.
	 */
	consumers: {
		/**
		 * An instance of an Azure Application Insights client {@link @microsoft/applicationinsights-web#ApplicationInsights}
		 * The App Insights instance must be initialed before being provided which can be done via {@link @microsoft/applicationinsights-web#ApplicationInsights.loadAppInsights}
		 * `applicationInsightsClient.loadAppInsights(); `
		 *
		 * By providing this optional attribute, external telemetry will be sent to your Azure App Insights instnance in a controlled manner.
		 */
		appInsights?: ApplicationInsights;
	};
}

/**
 * Starts external telemetry managers for one or more areas of the Fluid Framework.
 * @beta
 */
export const startTelemetryManagers = (config: TelemetryManagerConfig): void => {
	const consumers: ITelemetryConsumer[] = [];
	if (config.consumers.appInsights) {
		const telemetryConsumer = new AppInsightsTelemetryConsumer(config.consumers.appInsights);
		consumers.push(telemetryConsumer);
	}

	if (config.containerTelemetry) {
		const telemetryProducer = new ContainerEventTelemetryProducer(
			config.containerTelemetry.container,
		);
		new ContainerTelemetryManager(
			config.containerTelemetry.container,
			telemetryProducer,
			consumers,
		);
	}
};
