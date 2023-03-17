import * as appInsights from "applicationinsights";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

export interface AppInsightsLoggerConfig {
	appInsightsClient?: appInsights.TelemetryClient;
	connectionString?: string;
}

export abstract class AppInsightsLogger implements ITelemetryBufferedLogger {
	protected readonly baseLoggingClient: appInsights.TelemetryClient;

	public constructor(config: AppInsightsLoggerConfig) {
		if (config.appInsightsClient) {
			this.baseLoggingClient = config.appInsightsClient;
		} else {
			if (config.connectionString === undefined) {
				throw Error("Cannot initialize AppInsightsLogger without a connection string if no app insights client is provided.")
			}
			appInsights.setup().start();
			this.baseLoggingClient = appInsights.defaultClient;
		}
	}

	
	getBaseLoggingClient() {
		return this.baseLoggingClient;
	}

	send(event: ITelemetryBaseEvent): void {
		this.baseLoggingClient.trackEvent({
			name: event.eventName,
			properties: event
		});
	}

	async flush(runInfo?: { url: string; runId?: number }): Promise<void> {
		// await until data is posted to the server.
		await new Promise<void>((resolve) => {
			this.baseLoggingClient.flush({
				callback: () => resolve(),
			});
		});
	}


	// abstract send(event: ITelemetryBaseEvent): void;

	// abstract sendToAppInsights(event: ITelemetryBaseEvent): void;
}

