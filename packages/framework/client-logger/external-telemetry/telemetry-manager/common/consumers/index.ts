export interface ITelemetryConsumer {
	consume(event: Record<string, any>);
}

export { AppInsightsTelemetryConsumer } from "./appInsightsTelemetryConsumer";
