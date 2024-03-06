export interface ITelemetryConsumer {
	consume(event: Record<string, any>);
}

export { ContainerEventTelemetryProducer } from "./container";
