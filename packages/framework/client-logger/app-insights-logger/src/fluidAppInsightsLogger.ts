/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

/**
 * An implementation of {@link @fluidframework/core-interfaces#ITelemetryBaseLogger | ITelemetryBaseLogger}
 * that routes Fluid telemetry events to Azure App Insights using the App Insights trackEvent API.
 * The provided ApplicationInsights instance MUST be initialized with client.loadAppInsights()
 * or else logging will not occur.
 * @sealed
 */
export class FluidAppInsightsLogger implements ITelemetryBaseLogger {
	/**
	 * The Azure ApplicationInsights client utilized by this logger.
	 * The ApplicationInsights instance MUST be initialized with client.loadAppInsights()
	 * or else logging will not occur.
	 */
	private readonly baseLoggingClient: ApplicationInsights;

	public constructor(client: ApplicationInsights) {
		this.baseLoggingClient = client;
	}

	/**
	 * Routes Fluid telemetry events to the trackEvent App Insights API
	 */
	public send(event: ITelemetryBaseEvent): void {
		this.baseLoggingClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}
