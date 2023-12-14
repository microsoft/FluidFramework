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
 * The configuration object for creating the logger via {@link createLogger}.
 * @internal
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
		 *
		 * @remarks Leaving this undefined will be treated as an empty array.
		 *
		 * In order for the filters to be valid they must meet the following conditions:
		 *
		 * 1. There must not be any two filters with the same `namespacePattern`.
		 *
		 * 2. All {@link NamespaceFilter} must not have any defined `namespacePatternException` that is not a child of the parent `namespacePattern`
		 */
		filters?: TelemetryFilter[];
	};
}

/**
 * A filter used to match against the category of a telemetry event
 * @internal
 */
export interface CategoryFilter {
	/**
	 * The categories of telemetry events that this filter applies to
	 */
	categories: TelemetryEventCategory[];
}

/**
 * A filter used to match against the namespaces of a telemetry event
 * @internal
 */
export interface NamespaceFilter {
	/**
	 * The namespace pattern to filter telemetry events.
	 *
	 * @remarks This will match namespaces that start with the given string. It is not a Regex pattern.
	 * @example
	 * "perf:latency" will match any namespace starting with "perf:latency"
	 */
	namespacePattern: string;
	/**
	 * A list of namespace patterns to explicitly exclude from the filter.
	 *
	 * @example
	 * If you have a namespacePattern of "perf:latency" but want to exclude
	 * events from "perf:latency:ops", you would add "perf:latency:ops" to this list.
	 */
	namespacePatternExceptions?: Set<string>;
}

/**
 * Object used with an {@link FluidAppInsightsLoggerConfig}
 * to define a filter with logic for matching it to telemetry events.
 * Filters can include either a category, namespace or both types of filters; a valid filter must have at least one defined.
 * Not definining the `categories` filter array is the same as providing an array with all possible categories.
 *
 * Events must satisify the following rules for a telemetry filter:
 *
 * 1. The event must match the requirements of the most specific relevant filter to it. This takes precedence over a more generic filter.
 * The less categories and longer the namespace within a filter, the more specific it is. Definining no categories is equivalant to defining all categories.
 *
 * 2. If a {@link TelemetryFilter} specifies both `categories` and a `namespace`, the event must match both.
 *
 * 3. If only `categories` or a `namespace` is provided, the event should just match the with whatever was defined.
 *
 * 4. If a `namespace` pattern exception is specified in the {@link TelemetryFilter}, the event should not match the exception pattern.
 * @example
 * With the following configuration, an event `{ namespace: "A.B.C", categories: ["generic"] }` will not be sent despite matching the first, less specific filter because it did not match the second filter which was the most relevant and specific
 * ```
 * const logger = new FluidAppInsightsLogger(appInsightsClient, {
 *			filtering: {
 *				mode: "inclusive",
 *				filters: [
 *					{
 *						namespacePattern: "A:B",
 *						categories: ["generic", "error"],
 *					},
 *					{
 *						namespacePattern: "A:B:C",
 *						categories: ["error"],
 *					},
 *				],
 *			},
 *		});
 * ```
 * @internal
 */
export type TelemetryFilter = CategoryFilter | NamespaceFilter | (CategoryFilter & NamespaceFilter);

/**
 * An implementation of {@link @fluidframework/core-interfaces#ITelemetryBaseLogger | ITelemetryBaseLogger}
 * that routes Fluid telemetry events to Azure App Insights using the App Insights trackEvent API.
 * The provided ApplicationInsights instance MUST be initialized with client.loadAppInsights()
 * or else logging will not occur.
 *
 * @sealed
 */
class FluidAppInsightsLogger implements ITelemetryBaseLogger {
	/**
	 * The Azure ApplicationInsights client utilized by this logger.
	 * The ApplicationInsights instance MUST be initialized with client.loadAppInsights()
	 * or else logging will not occur.
	 */
	private readonly baseLoggingClient: ApplicationInsights;
	private readonly config: FluidAppInsightsLoggerConfig;
	public constructor(client: ApplicationInsights, config?: FluidAppInsightsLoggerConfig) {
		this.baseLoggingClient = client;
		// Deep copy config to prevent issues if user mutates the object they passed in
		this.config = config
			? structuredClone(config)
			: {
					filtering: {
						mode: "exclusive",
						filters: [],
					},
			  };

		if (this.config.filtering.filters) {
			this.validateFilters(this.config.filtering.filters);
			// Sort filters by longest namespace first.
			this.config.filtering.filters.sort((a, b) => {
				const namespaceALength =
					"namespacePattern" in a && a.namespacePattern !== undefined
						? a.namespacePattern.length
						: 0;
				const namespaceBLength =
					"namespacePattern" in b && b.namespacePattern !== undefined
						? b.namespacePattern.length
						: 0;
				return namespaceBLength - namespaceALength;
			});
		}
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
	 * 1. The event must match the requirements of the most specific relevant filter to it. This takes precedence over a more generic filter.
	 * The less categories and longer the namespace within a filter, the more specific it is. Definining no categories is equivalant to defining all categories.
	 *
	 * 2. If a {@link TelemetryFilter} specifies both `categories` and a `namespace`, the event must match both.
	 *
	 * 3. If only `categories` or a `namespace` is provided, the event should match either one of them.
	 *
	 * 4. If a `namespace` pattern exception is specified in the {@link TelemetryFilter}, the event should not match the exception pattern.
	 *
	 * @param event - The telemetry event to check against the filters.
	 *
	 * @returns `true` if the event matches any filter, otherwise `false`.
	 */
	private doesEventMatchFilter(event: ITelemetryBaseEvent): boolean {
		for (const filter of this.config.filtering.filters ?? []) {
			if ("namespacePattern" in filter && filter.namespacePattern !== undefined) {
				if (event.eventName.startsWith(filter.namespacePattern)) {
					// Found matching namespace pattern, since filters are ordered in most specific first,
					// this is the most specific, relevant matching filter for the event.

					// By default, if no categories are defined then any category is a valid match.
					let doesFilterCategoriesMatch = true;
					if (
						"categories" in filter &&
						filter.categories !== undefined &&
						filter.categories.length > 0
					) {
						doesFilterCategoriesMatch = false;
						const matchingCategory = filter.categories.find(
							(category) => category === event.category,
						);
						doesFilterCategoriesMatch = matchingCategory ? true : false;
					}

					if (doesFilterCategoriesMatch) {
						// The most specific, relevant filter matches so no need to attempt to evaluate against other filters
						// as long as the events namespace does not match any defined namespace exception.
						if (filter.namespacePatternExceptions !== undefined) {
							for (const patternException of filter.namespacePatternExceptions) {
								if (event.eventName.startsWith(patternException)) {
									return false;
								}
							}
						}
						return true;
					} else {
						return false;
					}
				}
			}
			// Filter only has categories defined
			else if (
				"categories" in filter &&
				filter.categories !== undefined &&
				filter.categories.length > 0
			) {
				const doesFilterCategoriesMatch = filter.categories.find(
					(category) => category === event.category,
				);

				// This filter specified no namespaces but it has a category match.
				// Since filters are ordered by most specific first, we know that no previous
				// filters with namespaces matched so we can return true.
				if (doesFilterCategoriesMatch) {
					return true;
				} else {
					continue;
				}
			} else {
				return true;
			}
		}

		return false;
	}

	/**
	 * Checks an array of telemetry filters for any issues, merges redundant filters, and returns a fully validated array.
	 *
	 * @throws An Error if there are two filters with duplicate namespace patterns or a filter with a pattern exception that is not a child of the parent pattern.
	 */
	private validateFilters(filters: TelemetryFilter[]): void {
		const uniqueFilterNamespaces = new Set<string>();

		for (const filter of filters) {
			if ("namespacePattern" in filter && filter.namespacePattern !== undefined) {
				if (uniqueFilterNamespaces.has(filter.namespacePattern)) {
					throw new Error("Cannot have duplicate namespace pattern filters");
				} else {
					uniqueFilterNamespaces.add(filter.namespacePattern);
				}

				for (const patternException of filter.namespacePatternExceptions ?? []) {
					if (!patternException.startsWith(filter.namespacePattern)) {
						throw new Error(
							"Cannot have a namespace pattern exception that is not a child of the parent namespace",
						);
					}
				}
			} else if ("categories" in filter && filter.categories !== undefined) {
				// These are filters that only contain "categories". For the purpose of this validation logic, we are treating filters
				// that does not contain a defined namespace as the the same as a blank "" namespace pattern (which will match any event).
				if (uniqueFilterNamespaces.has("")) {
					throw new Error("Cannot have multiple filters that only define categories");
				}
				uniqueFilterNamespaces.add("");
			} else {
				throw new Error("Invalid filter does not have either a namespace or a category.");
			}
		}
	}
}

/**
 * Creates an {@link @fluidframework/core-interfaces#ITelemetryBaseLogger | ITelemetryBaseLogger}
 * that routes Fluid telemetry events to Azure App Insights using the App Insights trackEvent API.
 *
 * The provided ApplicationInsights instance MUST be initialized with client.loadAppInsights(),
 * or else logging will not occur.
 *
 * @internal
 */
export function createLogger(
	client: ApplicationInsights,
	config?: FluidAppInsightsLoggerConfig,
): ITelemetryBaseLogger {
	return new FluidAppInsightsLogger(client, config);
}
