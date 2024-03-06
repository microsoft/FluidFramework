export interface ITelemetryConsumer {
	consume(event: Record<string, any>);
}
