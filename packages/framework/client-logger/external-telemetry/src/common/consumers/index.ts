/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base interface for all telemetry consumers.
 * Conusmers are intended to take incoming produced {@link IExternalTelemetry} and do something of your choice with it.
 * This could be sending the telemetry to a cloud platform or just console logging.
 *
 * @example
 * Here is how we construct a consumer to send telemetry to Azure App Insights, a cloud logging platform:
 * ```ts
 * class AppInsightsTelemetryConsumer implements ITelemetryConsumer {
 *	   constructor(private readonly appInsightsClient: ApplicationInsights) {}
 *
 *	   consume(event: IExternalTelemetry) {
 *		   this.appInsightsClient.trackEvent({
 *			   name: event.eventName,
 *			   properties: event,
 *		   });
 *	   }
 * }
 *```
 *
 * @beta
 */
export interface ITelemetryConsumer {
	consume(event: Record<string, any>);
}
