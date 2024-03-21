/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import type { ITelemetryConsumer } from ".";
import type { IExternalTelemetry } from "../telemetry";

/**
 * A simple implementation of {@link ITelemetryConsumer} for sending {@link IExternalTelemetry}
 * to Azure App Insights in a controlled manner.
 */
export class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
	constructor(private readonly appInsightsClient: ApplicationInsights) {}

	consume(event: IExternalTelemetry) {
		this.appInsightsClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}
