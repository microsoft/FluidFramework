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
		 * Controls the filtering of log events.
		 * Leaving this undefined will be treated as an empty array.
		 */
		filters?: TelemetryFilter[];
	};
}

/**
 * Object used with an {@link FluidAppInsightsLoggerConfig}
 * to define a filter with logic for matching it to telemetry events.
 * Filters can include either a category, namespace or both types of filters; a valid filter must have at least one defined.
 *
 * @public
 */
export interface TelemetryFilter {
	/**
	 * The categories of telemetry events that this filter applies to
	 */
	categories?: TelemetryEventCategory[];
	/**
	 * The namespace pattern to filter telemetry events.
	 *
	 * @remarks This will match namespaces that start with the given string. It is not a Regex pattern.
	 * @example
	 * "perf:latency" will match any namespace starting with "perf:latency"
	 */
	namespacePattern?: string;
	/**
	 * A list of namespace patterns to explicitly exclude from the filter.
	 *
	 * @example
	 * if you have a namespacePattern of "perf:latency" but want to exclude
	 * events from "perf:latency:ops", you would add "perf:latency:ops" to this list.
	 */
	namespacePatternExceptions?: string[];
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

		for (const filter of config?.filtering.filters ?? []) {
			const isValidFilter =
				(filter.categories !== undefined && filter.categories.length > 0) ||
				filter.namespacePattern !== undefined;
			if (!isValidFilter) {
				throw new Error("Invalid filter config provided to Fluid App Insights Logger");
			}
		}

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

	/**
	 * Checks if a given telemetry event conforms to any of the provided {@link TelemetryFilter} rules.
	 *
	 * - If a {@link TelemetryFilter} specifies both a `category` and a `namespace`, the event must match both.
	 * - If only a `category` or `namespace` is provided, the event should match either one of them.
	 * - If a `namespace` pattern exception is specified in the {@link TelemetryFilter}, the event should not match the exception pattern.
	 *
	 * @param event - The telemetry event to check against the filters.
	 *
	 * @returns boolean `true` if the event matches any filter, otherwise `false`.
	 */
	private doesEventMatchFilter(event: ITelemetryBaseEvent): boolean {
		for (const filter of this.config.filtering.filters ?? []) {
			let matches = true;

			// If the filter has atleast one category and none of them match the event's category, skip to next filter
			if (filter.categories && filter.categories.length > 0) {
				const hasMatch = filter.categories.find((category) => category === event.category);
				if (!hasMatch) {
					continue;
				}
			}

			// If the filter has a namespacePattern, test the event's namespace against it
			if (
				filter.namespacePattern !== undefined &&
				!event.eventName.startsWith(filter.namespacePattern)
			) {
				continue;
			}

			// If the filter has any excludedNamespacePatterns, test the event's namespace against them
			if (filter.namespacePatternExceptions !== undefined) {
				for (const patternException of filter.namespacePatternExceptions) {
					if (event.eventName.startsWith(patternException)) {
						matches = false;
						break;
					}
				}
			}

			// If the current filter matches the event, return it
			if (matches) {
				return true;
			}
		}
		return false;
	}
}
