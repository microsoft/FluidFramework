/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

/**
 * An implementation of ITelemetryBaseLogger that routes Fluid telemetry
 * events to Azure App Insights using the App Insights trackEvent API
 * @public
 */
export class FluidAppInsightsLogger implements ITelemetryBaseLogger {
	/**
	 * The Azure ApplicationInsights client utilized by this logger
	 */
	protected readonly baseLoggingClient: ApplicationInsights;

	public constructor(client: ApplicationInsights) {
		this.baseLoggingClient = client;
		this.baseLoggingClient.loadAppInsights();
	}

	/**
	 * Routes Fluid telemetry events to the trackEvent App Insights API
	 */
	send(event: ITelemetryBaseEvent): void {
		this.baseLoggingClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}
