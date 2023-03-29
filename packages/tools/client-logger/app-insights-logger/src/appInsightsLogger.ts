import { ApplicationInsights, Snippet } from "@microsoft/applicationinsights-web";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

export interface AppInsightsLoggerConfig {
	appInsightsClient?: ApplicationInsights;
	appInsightsConfig?: Snippet;
}

export class AppInsightsLogger implements ITelemetryBufferedLogger {
	protected readonly baseLoggingClient: ApplicationInsights;

	public constructor(loggerConfig: AppInsightsLoggerConfig) {
		if (loggerConfig.appInsightsClient) {
			this.baseLoggingClient = loggerConfig.appInsightsClient;
		} else {
			if (loggerConfig.appInsightsConfig === undefined) {
				throw Error(
					"Cannot initialize default AppInsights Client without a configuration object.",
				);
			}
			this.baseLoggingClient = new ApplicationInsights(loggerConfig.appInsightsConfig);
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
