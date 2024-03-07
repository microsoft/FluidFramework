import { IContainer } from "@fluidframework/container-definitions";
import { ContainerEventName } from "./containerEvents";
import { IContainerTelemetry } from "./containerTelemetry";
import { ContainerEventTelemetryProducer } from "./telemetryProducer";
import { ITelemetryConsumer } from "../common/consumers";

export class ContainerTelemetryManager {
	constructor(
		private readonly container: IContainer,
		private readonly telemetryProducer: ContainerEventTelemetryProducer,
		private readonly telemetryConsumer: ITelemetryConsumer,
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
