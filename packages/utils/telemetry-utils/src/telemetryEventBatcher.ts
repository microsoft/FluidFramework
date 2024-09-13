/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { roundToDecimalPlaces } from "./mathTools.js";
import type {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "./telemetryTypes.js";

/**
 * Telemetry class that accumulates measurements which are eventually logged in a telemetry event through the provided
 * {@link TelemetryEventBatcher.logger | logger} when the number of calls to the function reaches the specified {@link TelemetryEventBatcher.threshold | threshold}.
 *
 * @remarks It is expected to be used for a single event type. If different properties should be logged at different times, a separate `TelemetryEventBatcher` should be created with separate `TMetrics` type.
 * @typeparam TMetrics - The set of keys that should be logged.
 * E.g., `keyof Foo` for logging properties `bar` and `baz` from `type Foo = { bar: number, baz: number }`.
 *
 * @sealed
 * @internal
 */
export class TelemetryEventBatcher<TMetrics extends string> {
	/**
	 * Stores the sum of the custom data passed into the logger.
	 */
	private dataSums: { [key in TMetrics]?: number } = {};

	/**
	 * Stores the maximum value of the custom data passed into the logger.
	 */
	private dataMaxes: { [key in TMetrics]?: number } = {};

	/**
	 * Counter to keep track of the number of times the log function is called.
	 */
	private counter = 0;

	public constructor(
		/**
		 * Custom properties to include in the telemetry performance event when it is written.
		 */
		private readonly eventBase: ITelemetryGenericEventExt,

		/**
		 * The logger to use to write the telemetry performance event.
		 */
		private readonly logger: ITelemetryLoggerExt,

		/**
		 * The number of logs to accumulate before sending the data to the logger.
		 */
		private readonly threshold: number,
	) {}

	/**
	 * Accumulates the custom data and sends it to the logger every {@link TelemetryEventBatcher.threshold} calls.
	 *
	 * @param customData -
	 * A record storing the custom data to be accumulated and eventually logged.
	 */
	public accumulateAndLog(customData: Record<TMetrics, number>): void {
		for (const key of Object.keys(customData) as TMetrics[]) {
			this.dataSums[key] = (this.dataSums[key] ?? 0) + customData[key];
			this.dataMaxes[key] = Math.max(
				this.dataMaxes[key] ?? Number.NEGATIVE_INFINITY,
				customData[key],
			);
		}

		this.counter++;

		if (this.counter >= this.threshold) {
			this.sendData();
		}
	}

	private sendData(): void {
		const telemetryEvent: ITelemetryPerformanceEventExt = {
			...this.eventBase,
		};

		for (const key of Object.keys(this.dataSums) as TMetrics[]) {
			const dataSum = this.dataSums[key];
			if (dataSum !== undefined) {
				telemetryEvent[`avg_${key}`] = roundToDecimalPlaces(dataSum / this.counter, 6);
			}
			if (this.dataMaxes[key] !== undefined) {
				telemetryEvent[`max_${key}`] = this.dataMaxes[key];
			}
		}

		this.logger.sendPerformanceEvent(telemetryEvent);

		// Reset the counter and the data.
		this.counter = 0;
		this.dataSums = {};
		this.dataMaxes = {};
	}
}
