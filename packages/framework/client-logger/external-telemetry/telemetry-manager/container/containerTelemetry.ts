import type { IExternalTelemetry } from "../common/telemetry";
import type { ContainerEventName } from "./containerEvents";

export interface IContainerTelemetry extends IExternalTelemetry {
	eventName: ContainerEventName;
	containerId?: string;
	documentId?: string;
}

export interface ContainerConnectedTelemetry extends IContainerTelemetry {
	eventName: ContainerEventName.CONNECTED;
}
