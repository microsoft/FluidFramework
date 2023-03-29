import { ApplicationInsights } from "@microsoft/applicationinsights-web";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

export interface AppInsightsLoggerConfig {
	appInsightsClient?: ApplicationInsights;
	connectionString?: string;
}

export class AppInsightsLogger implements ITelemetryBufferedLogger {
	protected readonly baseLoggingClient: ApplicationInsights;

	public constructor(config: AppInsightsLoggerConfig) {
		if (config.appInsightsClient) {
			this.baseLoggingClient = config.appInsightsClient;
		} else {
			if (config.connectionString === undefined) {
				throw Error(
					"Cannot initialize default AppInsights Client without a connection string.",
				);
			}
			this.baseLoggingClient = new ApplicationInsights({
				config: {
					connectionString: config.connectionString,
				},
			});
			this.baseLoggingClient.loadAppInsights();
		}
	}

	getBaseLoggingClient() {
		return this.baseLoggingClient;
	}

	send(event: ITelemetryBaseEvent): void {
		this.baseLoggingClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}

	async flush(): Promise<void> {
		this.baseLoggingClient.flush();
	}
}
