/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "./telemetryTypes.js";

/**
 * Expected type of the custom data passed into the logger.
 */
type Data<TMetrics extends string> = { readonly [key in TMetrics]: number };

/**
 * Telemetry class that accumulates user defined telemetry metrics {@link ICustomDataMap} and sends it to the {@link  ITelemetryLoggerExt} logger provided to this class every time the {@link TelemetryEventBatcher.log} function is called reaches a number specified by the `threshold` value to this classes' constructor.
 * @typeparam TMetrics - The set of keys that should be logged.
 * E.g., `keyof Foo` for logging properties `bar` and `baz` from `type Foo = { bar: number, baz: number }`.
 */
export class TelemetryEventBatcher<TMetrics extends string> {
	// `dataSums`: stores the sum of the custom data passed into the logger.
	// `dataMaxes`: stores the maximum value of the custom data passed into the logger.
	// `dataSums` and `dataMaxes` should share identical sets of properties.
	private dataSums: { [key in TMetrics]?: number } = {};
	private dataMaxes: { [key in TMetrics]?: number } = {};

	// Counter to keep track of the number of times the log function is called.
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
	 * Accumulates the custom data and sends it to the logger every time the number of logs reaches the threshold by calling `sendData()`.
	 *
	 * @param customData -
	 * A record storing the custom data to be logged.
	 */
	public log(customData: Data<TMetrics>): void {
		for (const key of Object.keys(customData) as TMetrics[]) {
			this.dataSums[key] = (this.dataSums[key] ?? 0) + customData[key];
			this.dataMaxes[key] = Math.max(this.dataMaxes[key] ?? 0, customData[key]);
		}

		this.counter++;

		if (this.counter >= this.threshold) {
			this.sendData();
		}
	}

	private sendData(): void {
		for (const key of Object.keys(this.dataSums) as TMetrics[]) {
			// TODO copy the data somewhere else instead of mutating in place.
			// This way you can add the "avg" and "max" qualifers to the key names
			this.dataSums[key]! /= this.counter;
		}

		// TODO: Add `average` name to the custom data.
		const telemetryEvent: ITelemetryPerformanceEventExt = {
			...this.eventBase,
			...customData,
		};

		this.logger.sendPerformanceEvent(telemetryEvent);

		// Reset the counter and the data.
		this.counter = 0;
		this.dataSums = {};
		this.dataMaxes = {};
	}
}
