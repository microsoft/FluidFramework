import { ExternalTelemetryEventName, ContainerEventName } from "./events";

export interface IExternalTelemetry {
	eventName: ExternalTelemetryEventName;
}

export interface IContainerTelemetry extends IExternalTelemetry {
	eventName: ContainerEventName;
	containerId?: string;
	documentId?: string;
}

export interface ContainerConnectedTelemetry extends IContainerTelemetry {
	eventName: ContainerEventName.CONNECTED;
}
