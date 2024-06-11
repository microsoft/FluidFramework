/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { truncateToDecimalPlaces } from "./mathTools.js";
import type {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "./telemetryTypes.js";

/**
 * Expected type of the custom data passed into the logger.
 */
type Data<T extends string> = { readonly [key in T]: number };

/**
 * Expected type of the custom data passed into the logger.
 */
interface IMeasuredCodeResult<T extends string> {
	telemetryProperties?: { readonly [key in T]: number };
}

/**
 * Telemetry class that accumulates user defined telemetry metrics {@link ICustomDataMap} and sends it to the {@link  ITelemetryLoggerExt} logger provided to this class every time the {@link TelemetryEventBatcher.log} the number of calls to this function reaches a number specified by {@link TelemetryEventBatcher.threshold}.
 * @typeparam TMetrics - The set of keys that should be logged.
 * E.g., `keyof Foo` for logging properties `bar` and `baz` from `type Foo = { bar: number, baz: number }`.
 */
export class TelemetryEventBatcher<TMetrics extends string> {
	/**
	 * `codeDuration`: stores the average duration of the code passed into the logger.
	 * `dataSums`: stores the sum of the custom data passed into the logger.
	 * `dataMaxes`: stores the maximum value of the custom data passed into the logger.
	 * `dataSums` and `dataMaxes` should share identical sets of properties.
	 */
	private codeDuration: number = 0;
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
	 * Executes the specified code and keeps track of execution time statistics.
	 *
	 */
	public measure<T extends IMeasuredCodeResult<TMetrics>>(
		codeToMeasure: () => T,
		customData: Data<TMetrics>,
	): T {
		const start = performance.now();
		const returnValue = codeToMeasure();
		const duration = performance.now() - start;

		this.codeDuration = truncateToDecimalPlaces(
			(this.codeDuration + duration) / this.counter,
			6,
		);

		if (returnValue.telemetryProperties) {
			this.log(customData);
		}

		return returnValue;
	}

	/**
	 * Accumulates the custom data and sends it to the logger every {@link TelemetryEventBatcher.threshold} calls.
	 *
	 * @param customData -
	 * A record storing the custom data to be logged.
	 */
	private log(customData: Data<TMetrics>): void {
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
			if (this.dataSums[key] !== undefined) {
				telemetryEvent[`avg${key}`] = truncateToDecimalPlaces(
					this.dataSums[key]! / this.counter,
					6,
				);
			}
			if (this.dataMaxes[key] !== undefined) {
				telemetryEvent[`max${key}`] = this.dataMaxes[key];
			}
			telemetryEvent[`duration${key}`] = this.codeDuration;
		}

		this.logger.sendPerformanceEvent(telemetryEvent);

		// Reset the counter and the data.
		this.counter = 0;
		this.codeDuration = 0;
		this.dataSums = {};
		this.dataMaxes = {};
	}
}
