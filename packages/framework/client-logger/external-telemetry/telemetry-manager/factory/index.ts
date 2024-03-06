import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerTelemetryManager } from "../container/telemetryManager";
import { ContainerEventTelemetryProducer } from "../container/telemetryProducer";
import type { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { AppInsightsTelemetryConsumer } from "../common/consumers";

export interface AppInsightsTelemetryConsumerConfig {
	type: "AppInsights";
	consumer: ApplicationInsights;
}

export interface TelemetryManagerFactoryConfig {
	containerTelemetry?: {
		container: IContainer;
		consumerConfig: AppInsightsTelemetryConsumerConfig;
	};
}

export class TelemetryManagerFactory {
	static createTelemetryManagers(config: TelemetryManagerFactoryConfig): {
		container?: ContainerTelemetryManager;
	} {
		let containerTelemetryManager;
		if (config.containerTelemetry) {
			const container = config.containerTelemetry.container;
			const telemetryProducer = new ContainerEventTelemetryProducer(container);
			const telemetryConsumer = new AppInsightsTelemetryConsumer(
				config.containerTelemetry.consumerConfig.consumer,
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
