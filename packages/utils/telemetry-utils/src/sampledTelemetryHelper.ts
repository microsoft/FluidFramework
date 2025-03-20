/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import type { IDisposable, ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import { roundToDecimalPlaces } from "./mathTools.js";
import type {
	ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	ITelemetryPerformanceEventExt,
} from "./telemetryTypes.js";

/**
 * @privateRemarks
 *
 * The names of the properties in this interface are the ones that will get stamped in the
 * telemetry event, changes should be considered carefully. The optional properties should
 * only be populated if 'includeAggregateMetrics' is true.
 */
interface Measurements {
	/**
	 * The duration of the latest execution.
	 */
	duration: number;

	/**
	 * The number of executions since the last time an event was generated.
	 */
	count: number;

	/**
	 * Total duration across all the executions since the last event was generated.
	 */
	totalDuration?: number;

	/**
	 * Min duration across all the executions since the last event was generated.
	 */
	minDuration?: number;

	/**
	 * Max duration across all the executions since the last event was generated.
	 */
	maxDuration?: number;

	/**
	 * Average duration across all the executions since the last event was generated.
	 */
	averageDuration?: number;
}

/**
 * The data that will be logged in the telemetry event.
 */
interface LoggerData {
	measurements: Measurements;

	/**
	 * The sum of the custom data passed into the logger for each key.
	 * Absence of a given key should be interpreted as 0.
	 */
	dataSums: Record<string, number>;

	/**
	 * The max of the custom data passed into the logger for each key.
	 */
	dataMaxes: Record<string, number>;
}

/**
 * Helper type for an object whose properties are all numbers
 *
 * @internal
 */
export type CustomMetrics<TKey> = {
	[K in keyof TKey]: K extends string ? number : never;
};

/**
 * Potentially part of the structure of the return value of the function provided to {@link SampledTelemetryHelper.measure}.
 *
 * @see {@link MeasureReturnType} for more details on how this type is used.
 *
 * @internal
 */
export interface ICustomData<T> {
	customData: CustomMetrics<T>;
}

/**
 * Encapsulates the type-level logic for {@link SampledTelemetryHelper.measure}, to determine the expected return type
 * for the function that method receives (and by extension, its own return type). In words: {@link SampledTelemetryHelper}
 * is optionally provided with two generic types: one for custom metrics, and one for the actual return value of the
 * code that will be measured.
 *
 * - If no generic type is provided for custom metrics, then this type is simply the generic type provided for the actual
 * return value of the measured code (which could be void!).
 * - If a generic type is provided for custom metrics, then this type has a `customData` property whose type matches that
 * generic. Then if the generic type for the actual return value is not void, this type also has a property `returnValue`
 * whose type matches the generic type for the actual return value; if the generic type for the actual return value is
 * void, then this type _forbids_ a `returnValue` property (technically, it can exist but must be undefined in that case),
 * to try to ensure that the caller doesn't accidentally provide a function that actually returns a value.
 *
 * @internal
 */
export type MeasureReturnType<TMeasureReturn, TCustomMetrics> = TCustomMetrics extends void
	? TMeasureReturn
	: ICustomData<TCustomMetrics> &
			(TMeasureReturn extends void
				? { [K in "returnValue"]?: never }
				: { returnValue: TMeasureReturn });

/**
 * Helper class that executes a specified code block and writes an
 * {@link @fluidframework/core-interfaces#ITelemetryPerformanceEvent} to a specified logger every time a specified
 * number of executions is reached (or when the class is disposed).
 *
 * @remarks
 * The `duration` field in the telemetry event this class generates is the duration of the latest execution (sample)
 * of the specified code block.
 * See the documentation of the `includeAggregateMetrics` parameter for additional details that can be included.
 *
 * @typeParam TMeasurementReturn - The return type (in a vacuum) of the code block that will be measured, ignoring
 * any custom metric data that might be required by this class. E.g., the code might just return a boolean.
 * @typeParam TCustomMetrics - A type that contains the custom properties that will be used by an instance of this class
 * for custom metrics. Each property in this type should be a number.
 *
 * @internal
 */
export class SampledTelemetryHelper<
	TMeasureReturn = void,
	TCustomMetrics extends CustomMetrics<TCustomMetrics> = void,
> implements IDisposable
{
	private _disposed: boolean = false;

	/**
	 * {@inheritDoc @fluidframework/core-interfaces#IDisposable.disposed}
	 */
	public get disposed(): boolean {
		return this._disposed;
	}

	private readonly measurementsMap = new Map<string, LoggerData>();

	/**
	 * @param eventBase -
	 * Custom properties to include in the telemetry performance event when it is written.
	 * @param logger -
	 * The logger to use to write the telemetry performance event.
	 * @param sampleThreshold -
	 * Telemetry performance events will be generated every time we hit this many executions of the code block.
	 * @param includeAggregateMetrics -
	 * If set to `true`, the telemetry performance event will include aggregated metrics (total duration, min duration,
	 * max duration) for all the executions in between generated events.
	 * @param perBucketProperties -
	 * Map of strings that represent different buckets (which can be specified when calling the 'measure' method), to
	 * properties which should be added to the telemetry event for that bucket. If a bucket being measured does not
	 * have an entry in this map, no additional properties will be added to its telemetry events. The following keys are
	 * reserved for use by this class: "duration", "count", "totalDuration", "minDuration", "maxDuration". If any of
	 * them is specified as a key in one of the ITelemetryBaseProperties objects in this map, that key-value pair will be
	 * ignored.
	 */
	public constructor(
		private readonly eventBase: ITelemetryGenericEventExt,
		private readonly logger: ITelemetryLoggerExt,
		private readonly sampleThreshold: number,
		private readonly includeAggregateMetrics: boolean = false,
		private readonly perBucketProperties = new Map<string, ITelemetryBaseProperties>(),
	) {}

	/**
	 * Executes the specified code and keeps track of execution time statistics.
	 * When it's been called enough times (the sampleThreshold for the class) then it generates a log message with the
	 * necessary information.
	 *
	 * @remarks It's the responsibility of the caller to ensure that the same same set of custom metric properties is
	 * provided each time this method is called on a given instance of {@link SampledTelemetryHelper}.
	 * Otherwise the final measurements in the telemetry event may not be accurate.
	 *
	 * @param codeToMeasure - The code to be executed and measured.
	 * @param bucket - A key to track executions of the code block separately.
	 * Each different value of this parameter has a separate set of executions and metrics tracked by the class.
	 * If no such distinction needs to be made, do not provide a value.
	 * @returns Whatever the passed-in code block returns.
	 */
	public measure(
		codeToMeasure: () => MeasureReturnType<TMeasureReturn, TCustomMetrics>,
		bucket: string = "",
	): MeasureReturnType<TMeasureReturn, TCustomMetrics> {
		const start = performanceNow();
		const returnValue = codeToMeasure();
		const duration = performanceNow() - start;

		let loggerData = this.measurementsMap.get(bucket);
		if (loggerData === undefined) {
			loggerData = {
				measurements: { count: 0, duration: -1 },
				dataSums: {},
				dataMaxes: {},
			};
			this.measurementsMap.set(bucket, loggerData);
		}

		const m = loggerData.measurements;
		m.count++;
		m.duration = duration;

		if (this.includeAggregateMetrics) {
			m.totalDuration = (m.totalDuration ?? 0) + duration;
			m.minDuration = Math.min(m.minDuration ?? duration, duration);
			m.maxDuration = Math.max(m.maxDuration ?? 0, duration);
		}

		if (this.isCustomData(returnValue)) {
			loggerData = this.accumulateCustomData(returnValue.customData, loggerData);
		}

		if (m.count >= this.sampleThreshold) {
			// Computed separately to avoid multiple division operations.
			if (this.includeAggregateMetrics) {
				m.averageDuration = (m.totalDuration ?? 0) / m.count;
			}
			this.flushBucket(bucket);
		}

		return returnValue;
	}

	private isCustomData(data: unknown): data is ICustomData<TCustomMetrics> {
		return (
			typeof data === "object" &&
			data !== null &&
			"customData" in data &&
			typeof data.customData === "object"
		);
	}

	private accumulateCustomData(
		customData: CustomMetrics<TCustomMetrics>,
		loggerData: LoggerData,
	): LoggerData {
		for (const [key, val] of Object.entries(customData)) {
			assert(typeof key === "string", 0x9df /* Key should be a string */);
			assert(typeof val === "number", 0x9e0 /* Value should be a number */);

			loggerData.dataSums[key] = (loggerData.dataSums[key] ?? 0) + val;
			loggerData.dataMaxes[key] = Math.max(
				loggerData.dataMaxes[key] ?? Number.NEGATIVE_INFINITY,
				val,
			);
		}

		return loggerData;
	}

	private processCustomData(loggerData: LoggerData, count: number): Record<string, number> {
		const processedCustomData: Record<string, number> = {};

		if (loggerData.dataSums === undefined || loggerData.dataMaxes === undefined) {
			return processedCustomData;
		}

		const dataSums = loggerData.dataSums;
		const dataMaxes = loggerData.dataMaxes;

		for (const [key, val] of Object.entries(dataSums)) {
			// implementation of class guarantees the keys between dataMaxes and dataSums align.
			processedCustomData[`avg_${key}`] = roundToDecimalPlaces(val / count, 6);
			processedCustomData[`max_${key}`] = dataMaxes[key] ?? 0;
		}

		return processedCustomData;
	}

	private flushBucket(bucket: string): void {
		const loggerData = this.measurementsMap.get(bucket);
		if (loggerData === undefined) {
			return;
		}

		const measurements = loggerData.measurements;

		const processedCustomData = this.processCustomData(loggerData, measurements.count);

		if (measurements.count !== 0) {
			const bucketProperties = this.perBucketProperties.get(bucket);

			const telemetryEvent: ITelemetryPerformanceEventExt = {
				...this.eventBase,
				...bucketProperties, // If the bucket doesn't exist and this is undefined, things work as expected
				...measurements,
				...processedCustomData,
			};

			this.logger.sendPerformanceEvent(telemetryEvent);
			this.measurementsMap.delete(bucket);
		}
	}

	public dispose(error?: Error | undefined): void {
		for (const [k] of this.measurementsMap.entries()) {
			this.flushBucket(k);
		}
		this._disposed = true;
	}
}
