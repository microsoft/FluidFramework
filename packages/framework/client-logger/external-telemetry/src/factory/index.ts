/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerTelemetryManager } from "../container";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer";
import type { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { AppInsightsTelemetryConsumer } from "../common";

export interface AppInsightsTelemetryConsumerConfig extends ConsumerConfig {
	type: "AppInsights";
	appInsightsClient: ApplicationInsights;
}

export interface ConsumerConfig {
	type: "AppInsights";
}

export interface TelemetryManagerConfig {
	containerTelemetry?: {
		container: IContainer;
		consumerConfig: ConsumerConfig;
	};
}

/**
 * This class helps simplify the creation of one or more telemetry managers.
 */
export class TelemetryManagerFactory {
	static createTelemetryManagers(config: TelemetryManagerConfig): {
		container?: ContainerTelemetryManager;
	} {
		let containerTelemetryManager;
		if (
			config.containerTelemetry &&
			config.containerTelemetry.consumerConfig.type === "AppInsights"
		) {
			const consumerConfig = config.containerTelemetry
				.consumerConfig as AppInsightsTelemetryConsumerConfig;
			const container = config.containerTelemetry.container;
			const telemetryProducer = new ContainerEventTelemetryProducer(container);
			const telemetryConsumer = new AppInsightsTelemetryConsumer(
				consumerConfig.appInsightsClient,
			);
			containerTelemetryManager = new ContainerTelemetryManager(
				container,
				telemetryProducer,
				telemetryConsumer,
			);
		}

		return {
			container: containerTelemetryManager,
		};
	}
}

/**
 * Creates external telemetry managers for one or more areas of the Fluid Framework.
 */
export const createTelemetryManagers = (config: TelemetryManagerConfig) => {
	return TelemetryManagerFactory.createTelemetryManagers(config);
};
