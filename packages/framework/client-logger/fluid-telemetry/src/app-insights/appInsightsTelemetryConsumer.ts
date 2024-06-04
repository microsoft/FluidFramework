/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApplicationInsights } from "@microsoft/applicationinsights-web";

import type { IFluidTelemetry, ITelemetryConsumer } from "../common/index.js";

/**
 * An implementation of {@link ITelemetryConsumer} that routes {@link IFluidTelemetry} to Azure App Insights
 * in a format that is supported by Fluid Framework service offerings such as Cloud dashboards and alarms.
 *
 * @beta
 */
export class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
	public constructor(private readonly appInsightsClient: ApplicationInsights) {}

	/**
	 * Takes the incoming {@link IFluidTelemetry} and sends it to Azure App Insights
	 */
	public consume(event: IFluidTelemetry): void {
		this.appInsightsClient.trackEvent({
			name: event.eventName,
			properties: event,
		});
	}
}
