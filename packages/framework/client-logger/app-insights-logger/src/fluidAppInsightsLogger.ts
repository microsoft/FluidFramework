/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ApplicationInsights } from "@microsoft/applicationinsights-web";
import {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";

/**
 * An Enum of Fluid telemetry event categories
 */
export const TelemetryEventCategory = {
	PERFORMANCE: "performance",
	GENERIC: "generic",
	ERROR: "error",
} as const;

/**
 * The type for the enum of Fluid telemetry event categories
 */
export type TelemetryEventCategory =
	(typeof TelemetryEventCategory)[keyof typeof TelemetryEventCategory];

/**
 * The configuration object for the {@link FluidAppInsightsLogger}
 */
export interface FluidAppInsightsLoggerConfig {
	filterConfig: {
		/**
		 * Determines whether all telemetry events are sent or not sent by default and whether filters will exclude matching telemetry events or include them.
		 *
		 * "inclusive" mode means all logs are NOT SENT by default and only the events that match specified filters will be sent (included).
		 *
		 * "exclusive" mode means all logs ARE SENT by default and only the events that match specified filters will be  not be sent (excluded).
		 */
		mode: "inclusive" | "exclusive";
		/**
		 * Controls the default filtering of log events by their category.
		 * This can be overriden with namespace level filters
		 */
		filters?: TelemetryFilter[];
	};
}

/**
 * Object used with an {@link FluidAppInsightsLoggerConfig}
 * to define logic for filtering of telemetry events
 */
export interface TelemetryFilter {
	/**
	 * The category {@link TelemetryEventCategory} of telemetry event that this filter applies to
	 */
	category: TelemetryEventCategory;
	/**
	 * The priority in which this filter should be evaluated.
	 * A lower number means the filter will be evaluated earlier.
	 *
	 * If there are two filters with the same priority,
	 * there is no guarentee to the order in which they will be evaluated
	 */
	priority: number;
}

// Questions:
// Do log namespaces include the category as well? Or are they separate?

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
	private readonly config: FluidAppInsightsLoggerConfig;
	private readonly filters: TelemetryFilter[] = [];

	public constructor(client: ApplicationInsights, config?: FluidAppInsightsLoggerConfig) {
		this.baseLoggingClient = client;
		if (config === undefined) {
			this.config = {
				filterConfig: {
					mode: "exclusive",
					filters: [],
				},
			};
		} else {
			this.config = config;
			this.initializeFiltersFromConfig(config);
		}
	}

	private initializeFiltersFromConfig(config: FluidAppInsightsLoggerConfig): void {
		if (config.filterConfig.filters === undefined) {
			return;
		}

		for (const filter of config.filterConfig.filters) {
			this.filters.push(filter);
		}

		// Sort filters using priority from low to high
		this.filters.sort((a, b) => a.priority - b.priority);
	}

	/**
	 * Routes Fluid telemetry events to the trackEvent App Insights API.
	 * This method also uses the provided {@link FluidAppInsightsLoggerConfig} to
	 * determine whether an event should sent or not.
	 */
	public send(event: ITelemetryBaseEvent): void {
		// By default, "inclusive" filter mode means all events should not be sent by default
		// and the opposite is true for "exclusive".
		let shouldSendEvent = this.config.filterConfig.mode === "inclusive" ? false : true;
		if (this.filters.length > 0 && this.doesEventMatchFilter(event)) {
			// If the event does match a filter, in "inclusive" filter mode that means it should
			// be sent (included). In "exclusive" mode the opposite is true.
			shouldSendEvent = this.config.filterConfig.mode === "inclusive" ? true : false;
		}

		if (shouldSendEvent) {
			this.baseLoggingClient.trackEvent({
				name: event.eventName,
				properties: event,
			});
		}
	}

	private doesEventMatchFilter(event: ITelemetryBaseEvent): boolean {
		for (const filter of this.filters) {
			if (filter.category === event.category) {
				return true;
			}
		}
		return false;
	}
}
