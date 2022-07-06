/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDisposable,
    ITelemetryGenericEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
    ITelemetryProperties,
} from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";

interface Measurements {
    // The names of the properties in this interface are the ones that will get stamped in the
    // telemetry event, changes should be considered carefully. The optional properties should
    // only be populated if 'includeAggregateMetrics' is true.

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
 * Helper class that executes a specified code block and writes an
 * {@link @fluidframework/common-definitions#ITelemetryPerformanceEvent} to a specified logger every time a specified
 * number of executions is reached (or when the class is disposed). The `duration` field in the telemetry event is
 * the duration of the latest execution (sample) of the specified function. See the documentation of the
 * `includeAggregateMetrics` parameter for additional details that can be included.
 */
 export class SampledTelemetryHelper implements IDisposable {
    disposed: boolean = false;

    private readonly measurementsMap = new Map<string, Measurements>();

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
     * them is specified as a key in one of the ITelemetryProperties objects in this map, that key-value pair will be
     * ignored.
     */
    public constructor(
        private readonly eventBase: ITelemetryGenericEvent,
        private readonly logger: ITelemetryLogger,
        private readonly sampleThreshold: number,
        private readonly includeAggregateMetrics: boolean = false,
        private readonly perBucketProperties = new Map<string, ITelemetryProperties>()) {
    }

    /**
     * @param codeToMeasure -
     * The code to be executed and measured.
     * @param bucket -
     * A key to track executions of the code block separately. Each different value of this parameter has a separate
     * set of executions and metrics tracked by the class. If no such distinction needs to be made, do not provide a
     * value.
     * @returns Whatever the passed-in code block returns.
     */
    public measure<T>(codeToMeasure: () => T, bucket: string = ""): T {
        const start = performance.now();
        const returnValue = codeToMeasure();
        const duration = performance.now() - start;

        let m = this.measurementsMap.get(bucket);
        if (m === undefined) {
            m = { count: 0, duration: -1 };
            this.measurementsMap.set(bucket, m);
        }
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

    private flushBucket(bucket: string) {
        const measurements = this.measurementsMap.get(bucket);
        if (measurements === undefined) {
            return;
        }

        if (measurements.count !== 0) {
            const bucketProperties = this.perBucketProperties.get(bucket);

            const telemetryEvent: ITelemetryPerformanceEvent = {
                ...this.eventBase,
                ...bucketProperties, // If the bucket doesn't exist and this is undefined, things work as expected
                ...measurements,
            };

            this.logger.sendPerformanceEvent(telemetryEvent);
            this.measurementsMap.delete(bucket);
        }
    }

    public dispose(error?: Error | undefined): void {
        this.measurementsMap.forEach((_, k) => this.flushBucket(k));
    }
}
