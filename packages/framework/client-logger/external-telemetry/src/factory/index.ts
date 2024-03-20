import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerTelemetryManager } from "../container/telemetryManager";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer";
import type { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { AppInsightsTelemetryConsumer } from "../common/consumers";

export interface AppInsightsTelemetryConsumerConfig extends ConsumerConfig {
	type: "AppInsights";
	appInsightsClient: ApplicationInsights;
}

export interface ConsumerConfig {
	type: "AppInsights";
}

export interface TelemetryManagerFactoryConfig {
	containerTelemetry?: {
		container: IContainer;
		consumerConfig: ConsumerConfig;
	};
}

/**
 * This class helps simplify the creation of one or more telemetry managers.
 */
export class TelemetryManagerFactory {
	static createTelemetryManagers(config: TelemetryManagerFactoryConfig): {
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
