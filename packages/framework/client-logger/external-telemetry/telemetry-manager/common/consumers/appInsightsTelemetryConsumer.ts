import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import type { ITelemetryConsumer } from ".";

export class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
	constructor(private readonly appInsightsClient: ApplicationInsights) {}

	consume(event: Record<string, any>) {
		this.appInsightsClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}
