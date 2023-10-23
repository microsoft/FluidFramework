/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApplicationInsights } from "@microsoft/applicationinsights-web";
import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { type TelemetryEventCategory } from "@fluidframework/telemetry-utils";

/**
 * The configuration object for the {@link FluidAppInsightsLogger}
 *
 * @public
 */
export interface FluidAppInsightsLoggerConfig {
	/**
	 * This Configuration defines how filtering will be applied to Fluid telemetry events flowing through the logger.
	 * This determines which events will be sent to Azure App Insights.
	 */
	filtering: {
		/**
		 * Determines whether all telemetry events are sent or not sent by default and whether filters will exclude matching telemetry events or include them.
		 *
		 * "inclusive" mode means all logs are NOT SENT by default and only the events that match at least one or more specified filters WILL be sent (included).
		 *
		 * "exclusive" mode means all logs ARE SENT by default and only the events that match at least one or more specified filters WILL NOT be sent (excluded).
		 */
		mode: "inclusive" | "exclusive";
		/**
		 * Controls the default filtering of log events by their category.
		 * Leaving this undefined will be treated as an empty array.
		 */
		filters?: TelemetryFilter[];
	};
}

/**
 * Object used with an {@link FluidAppInsightsLoggerConfig}
 * to define logic for filtering of telemetry events
 *
 * @public
 */
export interface TelemetryFilter {
	/**
	 * The category of telemetry event that this filter applies to
	 */
	category: TelemetryEventCategory;
}

/**
 * An implementation of {@link @fluidframework/core-interfaces#ITelemetryBaseLogger | ITelemetryBaseLogger}
 * that routes Fluid telemetry events to Azure App Insights using the App Insights trackEvent API.
 * The provided ApplicationInsights instance MUST be initialized with client.loadAppInsights()
 * or else logging will not occur.
 *
 * @sealed
 * @public
 */
export class FluidAppInsightsLogger implements ITelemetryBaseLogger {
	/**
	 * The Azure ApplicationInsights client utilized by this logger.
	 * The ApplicationInsights instance MUST be initialized with client.loadAppInsights()
	 * or else logging will not occur.
	 */
	private readonly baseLoggingClient: ApplicationInsights;
	private readonly config: FluidAppInsightsLoggerConfig;

	public constructor(client: ApplicationInsights, config?: FluidAppInsightsLoggerConfig) {
		this.baseLoggingClient = client;
		this.config = config ?? {
			filtering: {
				mode: "exclusive",
				filters: [],
			},
		};
	}

	/**
	 * Routes Fluid telemetry events to the trackEvent App Insights API.
	 * This method also uses the provided {@link FluidAppInsightsLoggerConfig} to
	 * determine whether an event should be sent or not.
	 */
	public send(event: ITelemetryBaseEvent): void {
		if (this.shouldSendEvent(event)) {
			this.baseLoggingClient.trackEvent({
				name: event.eventName,
				properties: event,
			});
		}
	}

	private shouldSendEvent(event: ITelemetryBaseEvent): boolean {
		// No events should be sent by default in "inclusive" mode, and all events should be
		// sent by default in "exclusive" mode.
		let shouldSendEvent = this.config.filtering.mode === "inclusive" ? false : true;
		if (this.doesEventMatchFilter(event)) {
			// If the event does match a filter, in "inclusive" filter mode that means it should
			// be sent (included). In "exclusive" mode the opposite is true.
			shouldSendEvent = this.config.filtering.mode === "inclusive" ? true : false;
		}
		return shouldSendEvent;
	}

	private doesEventMatchFilter(event: ITelemetryBaseEvent): boolean {
		for (const filter of this.config.filtering.filters ?? []) {
			if (filter.category === event.category) {
				return true;
			}
		}
		return false;
	}
}
