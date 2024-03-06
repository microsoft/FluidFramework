import { IContainer } from "@fluidframework/container-definitions";
import { ContainerEventName } from "./events";
import type { IContainerTelemetry } from "./telemetry";
import { ContainerEventTelemetryProducer } from "./producers";
import type { ITelemetryConsumer } from "./consumers";

export interface ContainerTelemetryObserverConfig {
	// Ignore the given set of containerEvents
	ignoreList: Set<ContainerEventName>;
}

export class ContainerTelemetryManager {
	constructor(
		private readonly container: IContainer,
		private readonly telemetryProducer: ContainerEventTelemetryProducer,
		private readonly telemetryConsumer: ITelemetryConsumer,
		config?: ContainerTelemetryObserverConfig,
	) {
		this.setupEventHandlers(this.container);
	}

	private setupEventHandlers(container: IContainer) {
		container.on(ContainerEventName.CONNECTED, (clientId) =>
			this.handleContainerEvent(ContainerEventName.CONNECTED, { clientId }),
		);
	}

	private handleContainerEvent(eventName: ContainerEventName, payload?: any) {
		const telemetry: IContainerTelemetry | undefined = this.telemetryProducer.produceTelemetry(
			eventName,
			payload,
		);

		if (telemetry !== undefined) {
			this.telemetryConsumer.consume(telemetry);
		}
	}
}
