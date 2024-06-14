/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluid-internal/client-utils";
import type { IDisposable, ITelemetryBaseProperties } from "@fluidframework/core-interfaces";

import { roundToDecimalPlaces } from "./mathTools.js";
import {
	type ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	type ITelemetryPerformanceEventExt,
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
}

/**
 * TODO
 */
interface LoggerData<TCustomDataKey extends string> {
	measurements: Measurements;
	customData?: { readonly [key in TCustomDataKey]: number };
}

/**
 * Helper class that executes a specified code block and writes an
 * {@link @fluidframework/core-interfaces#ITelemetryPerformanceEvent} to a specified logger every time a specified
 * number of executions is reached (or when the class is disposed).
 *
 * The `duration` field in the telemetry event is the duration of the latest execution (sample) of the specified
 * function. See the documentation of the `includeAggregateMetrics` parameter for additional details that can be
 * included.
 *
 * @internal
 */
export class SampledTelemetryHelper<TCustomMetrics extends string> implements IDisposable {
	disposed: boolean = false;

	private readonly measurementsMap = new Map<string, LoggerData<TCustomMetrics>>();
	private readonly dataSums: { [key in TCustomMetrics]?: number } = {};
	private readonly dataMaxes: { [key in TCustomMetrics]?: number } = {};

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
	 * If it's been called enough times (the sampleThreshold for the class) then it generates a log message with the necessary information.
	 *
	 * @param codeToMeasure - The code to be executed and measured.
	 * @param bucket - A key to track executions of the code block separately.
	 * Each different value of this parameter has a separate set of executions and metrics tracked by the class.
	 * If no such distinction needs to be made, do not provide a value.
	 * @returns Whatever the passed-in code block returns.
	 */
	public measure<T extends LoggerData<TCustomMetrics>>(
		codeToMeasure: () => T,
		bucket: string = "",
	): T {
		const start = performance.now();
		const returnValue = codeToMeasure();
		const duration = performance.now() - start;

		let loggerData = this.measurementsMap.get(bucket);
		if (loggerData === undefined) {
			loggerData = {
				measurements: { count: 0, duration: -1 },
			};
			this.measurementsMap.set(bucket, loggerData);
		}

		if (returnValue.customData) {
			this.accumulateCustomData(returnValue.customData);
		}

		const m = loggerData.measurements;
		m.count++;
		m.duration = duration;

		if (this.includeAggregateMetrics) {
			m.totalDuration = (m.totalDuration ?? 0) + duration;
			m.minDuration = Math.min(m.minDuration ?? duration, duration);
			m.maxDuration = Math.max(m.maxDuration ?? 0, duration);
		}

		if (m.count >= this.sampleThreshold) {
			this.flushBucket(bucket);
		}

		return returnValue;
	}

	/**
	 * Accumulates the custom data and sends it to the logger every {@link SampledTelemetryHelper.sampleThreshold} calls.
	 *
	 * @param customData -
	 * A record storing the custom data to be accumulated and eventually logged.
	 */
	private accumulateCustomData(customData: Record<TCustomMetrics, number>): void {
		for (const key of Object.keys(customData) as TCustomMetrics[]) {
			this.dataSums[key] = (this.dataSums[key] ?? 0) + customData[key];
			this.dataMaxes[key] = Math.max(
				this.dataMaxes[key] ?? Number.NEGATIVE_INFINITY,
				customData[key],
			);
		}
	}

	/**
	 * Computes average and sets new names for keys.
	 *
	 * @param customData - A record storing the custom data that has been accumulated over {@link SampledTelemetryHelper.sampleThreshold} times.
	 * @param counts - The number of times the {@link SampledTelemetryHelper.measure} has been called.
	 * @returns A record with the average and maximum values of the custom data.
	 */
	private processCustomData(
		customData: Record<TCustomMetrics, number>,
		counts: number,
	): Record<string, number> {
		const processedCustomData: Record<string, number> = {};

		for (const key of Object.keys(customData) as TCustomMetrics[]) {
			if (this.dataSums[key] !== undefined) {
				processedCustomData[`avg${key}`] = roundToDecimalPlaces(
					this.dataSums[key]! / counts,
					6,
				);
			}
			if (this.dataMaxes[key] !== undefined) {
				processedCustomData[`max${key}`] = this.dataMaxes[key] ?? 0; // Added a default value to prevent undefined. But trying to verify why this can be undefined.
			}
		}

		return processedCustomData;
	}

	private flushBucket(bucket: string): void {
		const loggerData = this.measurementsMap.get(bucket);
		if (loggerData === undefined) {
			return;
		}

		const { measurements, customData } = loggerData;

		// TODO: I believe the check on `customData` is unnecessary.
		if (measurements.count !== 0) {
			const bucketProperties = this.perBucketProperties.get(bucket);

			let processedCustomData: Record<string, number> = {};
			if (customData !== undefined) {
				processedCustomData = this.processCustomData(customData, measurements.count);
			}

			const telemetryEvent: ITelemetryPerformanceEventExt = {
				...this.eventBase,
				...bucketProperties, // If the bucket doesn't exist and this is undefined, things work as expected
				...measurements,
				...processedCustomData, // If the customData doesn't exist and this is an empty object, things work as expected
			};

			this.logger.sendPerformanceEvent(telemetryEvent);
			this.measurementsMap.delete(bucket);
		}
	}

	public dispose(error?: Error | undefined): void {
		for (const [k] of this.measurementsMap.entries()) this.flushBucket(k);
	}
}
