/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerTelemetryManager } from "../container/index.js";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer.js";
import type { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { AppInsightsTelemetryConsumer } from "../common/index.js";

/**
 * Namespace for grouping things related to {@link (TelemetryManagerConfig:interface)}
 *
 * @beta
 */
export namespace TelemetryManagerConfig {
	/**
	 * Configuration details for the external telemetry consumer to be used by a Telemetry Manager
	 * @beta
	 */
	export interface IConsumerConfig {
		/**
		 * The type of telemetry consumer. This helps typecheck what the concrete type of a given instance of IConsumerConfig is.
		 */
		type: ConsumerConfigType;
	}

	/**
	 * Contains constants for the available types for {@link (TelemetryManagerConfig:namespace).IConsumerConfig."type"}
	 * @beta
	 */
	export const ConsumerConfigTypes = {
		/**
		 * Identifier to be used for {@link (TelemetryManagerConfig:namespace).IConsumerConfig} of type {@link (TelemetryManagerConfig:namespace).AppInsightsConsumerConfig}
		 */
		APP_INSIGHTS: "APP_INSIGHTS",
	} as const;

	/**
	 * Aggregate Type for all available types for {@link (TelemetryManagerConfig:namespace).IConsumerConfig."type"}
	 * @beta
	 */
	export type ConsumerConfigType = (typeof ConsumerConfigTypes)[keyof typeof ConsumerConfigTypes];

	/**
	 * Configuration for using Azure App Insights as the telemetry consumer for a given telemetry manager
	 * @beta
	 */
	export interface AppInsightsConsumerConfig extends IConsumerConfig {
		type: "APP_INSIGHTS";
		/** An instance of an Azure Application Insights client {@link @microsoft/applicationinsights-web#ApplicationInsights}
		 * The instance must be initialed before being used in the config. That command should be  {@link @microsoft/applicationinsights-web#ApplicationInsights.loadAppInsights}
		 * `applicationInsightsClient.loadAppInsights(); `
		 */
		appInsightsClient: ApplicationInsights;
	}
}

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
		consumerConfig: TelemetryManagerConfig.IConsumerConfig;
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
			config.containerTelemetry.consumerConfig.type ===
				TelemetryManagerConfig.ConsumerConfigTypes.APP_INSIGHTS
		) {
			const consumerConfig = config.containerTelemetry
				.consumerConfig as TelemetryManagerConfig.AppInsightsConsumerConfig;
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
 * @beta
 */
export const createTelemetryManagers = (config: TelemetryManagerConfig): void => {
	TelemetryManagerFactory.createTelemetryManagers(config);
};
