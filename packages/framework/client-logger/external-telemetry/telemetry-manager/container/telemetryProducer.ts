import { IContainer, IContainerEvents } from "@fluidframework/container-definitions";
import {
	ContainerConnectedTelemetry,
	ContainerTelemetryEventName,
	IContainerTelemetry,
} from "./containerTelemetry";
import { ContainerSystemEventName } from "./containerSystemEvents";

/**
 * This class produces {@link IContainerTelemetry} from raw container system events {@link IContainerEvents}.
 * The class contains different helper methods for simplifying and standardizing logic for adding additional information necessary
 * to produce different {@link IContainerTelemetry}.
 *
 */
export class ContainerEventTelemetryProducer {
	constructor(private container: IContainer) {}

	public produceTelemetry(
		eventName: ContainerSystemEventName,
		payload?: any,
	): IContainerTelemetry | undefined {
		switch (eventName) {
			case ContainerSystemEventName.CONNECTED:
				const telemetry = this.produceConnectedTelemetry(payload);
				return telemetry;
			default:
				return undefined;
		}
	}

	private produceConnectedTelemetry = (payload?: {
		clientId: string;
	}): ContainerConnectedTelemetry => {
		return {
			eventName: ContainerTelemetryEventName.CONNECTED,
			containerId: payload?.clientId ?? this.getContainerId(),
			documentId: this.getDocumentId(),
		};
	};

	private getContainerId(): string | undefined {
		return this.container.clientId;
	}

	private getDocumentId(): string | undefined {
		return this.container.resolvedUrl?.id;
	}
}

export interface ContainerTelemetryProducer {
	(payload?: any): IContainerTelemetry;
}
