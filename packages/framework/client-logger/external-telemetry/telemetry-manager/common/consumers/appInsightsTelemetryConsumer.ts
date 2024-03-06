import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import type { ITelemetryConsumer } from ".";
import type { IExternalTelemetry } from "../telemetry";

export class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
	constructor(private readonly appInsightsClient: ApplicationInsights) {}

	consume(event: IExternalTelemetry) {
		this.appInsightsClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}
