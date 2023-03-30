import { ApplicationInsights, Snippet } from "@microsoft/applicationinsights-web";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

export interface FluidAppInsightsLoggerConfig {
	appInsights: ApplicationInsights | Snippet;
}

export class FluidAppInsightsLogger implements ITelemetryBufferedLogger {
	protected readonly baseLoggingClient: ApplicationInsights;

	/**
	 * Creates an instance of FluidAppInsightsLogger using either a provided instance of ApplicationInsights
	 * logging client or by creating a new instance with a provided ApplicationInsights configuration object.
	 * @param config - Accepts either an existing preconfigured ApplicationInsights instance to use
	 * for logging or a config object used to instantiate an instance of ApplicationInsights.
	 */
	public constructor(config: FluidAppInsightsLoggerConfig) {
		if (config.appInsights instanceof ApplicationInsights) {
			this.baseLoggingClient = config.appInsights;
		} else {
			if (config.appInsights === undefined) {
				throw Error(
					"Cannot initialize default AppInsights Client without a configuration object.",
				);
			}
			this.baseLoggingClient = new ApplicationInsights(config.appInsights);
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
