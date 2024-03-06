import type { IContainer } from "@fluidframework/container-definitions";
import { ContainerEventName } from "./containerEvents";
import type { ContainerConnectedTelemetry, IContainerTelemetry } from "./containerTelemetry";

export class ContainerEventTelemetryProducer {
	private telemetryProducers = {
		[ContainerEventName.CONNECTED]: {
			produceTelemetry: (payload?: { clientId: string }): ContainerConnectedTelemetry => {
				return {
					eventName: ContainerEventName.CONNECTED,
					containerId: payload?.clientId ?? this.getContainerId(),
					documentId: this.getDocumentId(),
				};
			},
		},
	};

	constructor(private container: IContainer) {}

	public produceTelemetry(
		eventName: ContainerEventName,
		payload?: any,
	): IContainerTelemetry | undefined {
		const telemetryProducer = this.getProducer(eventName);
		if (telemetryProducer) {
			const telemetry = telemetryProducer.produceTelemetry(payload);
			return telemetry;
		}
		return undefined;
	}

	private getProducer(eventName: ContainerEventName): ContainerEventProducer | undefined {
		return this.telemetryProducers[eventName];
	}

	private getContainerId(): string | undefined {
		return this.container.clientId;
	}

	private getDocumentId(): string | undefined {
		return this.container.resolvedUrl?.id;
	}
}

export interface ContainerEventProducer {
	produceTelemetry(payload?: any): IContainerTelemetry;
}
