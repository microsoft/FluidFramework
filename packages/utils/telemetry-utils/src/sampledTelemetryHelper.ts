/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDisposable,
    ITelemetryGenericEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
} from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";

interface Measurements {
    // The names of the properties in this interface are the ones that will get stamped in the
    // telemetry event, changes should be considered carefully. The optional properties should
    // only be populated if 'includeAggregateMetrics' is true.

    duration: number;
    count?: number;
    totalDuration?: number;
    minDuration?: number;
    maxDuration?: number;
}

interface CountAndMeasurements { count: number; measurements: Measurements; }

/**
 * Helper class that executes a specified code block and writes an
 * {@link @fluidframework/common-definitions#ITelemetryPerformanceEvent} to a specified logger every time a specified
 * number of executions is reached (or when the class is disposed). The `duration` field in the telemetry event is
 * the duration of the latest execution (sample) of the specified function. See the documentation of the
 * `includeAggregateMetrics` parameter for additional details that can be included.
 */
 export class SampledTelemetryHelper implements IDisposable {
    disposed: boolean = false;

    private readonly measurementsMap = new Map<string, CountAndMeasurements>();

    /**
     * @param eventBase - Custom properties to include in the telemetry performance event when it is written.
     * @param logger - The logger to use to write the telemetry performance event.
     * @param sampleThreshold - Telemetry performance events will be generated every time we hit this many
     *                          executions of the code block.
     * @param includeAggregateMetrics - If set to `true`, the telemetry performance event will include aggregated
     *                                  metrics (execution count, total duration, min duration, max duration) for
     *                                  all the executions in between generated events.
     */
    public constructor(
        private readonly eventBase: ITelemetryGenericEvent,
        private readonly logger: ITelemetryLogger,
        private readonly sampleThreshold: number,
        private readonly includeAggregateMetrics: boolean = false) {
    }

    /**
     * @param codeToMeasure - The code to be executed and measured.
     * @param dimension - A key to track executions of the code block separately. Each different
     *                    value of this parameter has a separate set of executions and metrics tracked
     *                    by the class. If no such distinction needs to be made, do not provide a value.
     * @returns Whatever the passed-in code block returns.
     */
    public measure<T>(codeToMeasure: () => T, dimension: string = ""): T {
        const start = performance.now();
        const returnValue = codeToMeasure();
        const duration = performance.now() - start;

        let m = this.measurementsMap.get(dimension);
        if (m === undefined) {
            m = { count: 0, measurements: { duration: 0 } };
            this.measurementsMap.set(dimension, m);
        }
        m.count++;
        m.measurements.duration = duration;

        if (this.includeAggregateMetrics) {
            m.measurements.count = m.count;
            m.measurements.totalDuration = (m.measurements.totalDuration ?? 0) + duration;
            m.measurements.minDuration = Math.min(m.measurements.minDuration ?? duration, duration);
            m.measurements.maxDuration = Math.max(m.measurements.maxDuration ?? 0, duration);
        }

        if (m.count >= this.sampleThreshold) {
            this.flushDimension(dimension);
        }

        return returnValue;
    }

    private flushDimension(dimension: string) {
        const measurements = this.measurementsMap.get(dimension);
        if (measurements === undefined) {
            return;
        }

        if (measurements.count !== 0) {
            const telemetryEvent: ITelemetryPerformanceEvent = {
                ...this.eventBase,
                ...measurements.measurements,
                dimension,
            };

            this.logger.sendPerformanceEvent(telemetryEvent);
            this.measurementsMap.delete(dimension);
        }
    }

    public dispose(error?: Error | undefined): void {
        this.measurementsMap.forEach((_, k) => this.flushDimension(k));
    }
}
