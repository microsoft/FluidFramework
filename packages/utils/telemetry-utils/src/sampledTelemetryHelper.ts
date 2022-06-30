/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger, ITelemetryPerformanceEvent } from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";

interface Measurements {
    latestDuration: number;
    executionCount: number;
    totalDuration: number;
    minDuration: number | undefined;
    maxDuration: number | undefined;
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
     * @param eventBase - Custom properties to include in the telemetry performance event when it is written.
     * @param logger - The logger to use to write the telemetry performance event.
     * @param includeAggregateMetrics - If set to `true`, the telemetry performance event will include aggregated
     *                                  metrics (execution count, total duration, min duration, max duration) for
     *                                  all the executions in between generated events.
     */
    public constructor(
        private readonly eventBase: any,
        private readonly logger: ITelemetryLogger,
        private readonly includeAggregateMetrics: boolean = false) {
    }

    /**
     * @param codeToMeasure - The code to be executed and measured.
     * @param countThreshold - The telemetry performance event with aggregated data will be
     *                         generated after this many executions of the code block.
     * @param dimension - A key to track executions of the code block separately. Each different
     *                    value of this parameter has a separate set of executions and metrics tracked
     *                    by the class. If no such distinction needs to be made, do not provide a value.
     * @returns Whatever the passed-in code block returns.
     */
    public measure<T>(
        codeToMeasure: () => T,
        countThreshold: number,
        dimension: string = ""): T {
        const start = performance.now();
        const returnValue = codeToMeasure();
        const duration = performance.now() - start;

        let m = this.measurementsMap.get(dimension);
        if (m === undefined) {
            m = {
                latestDuration: 0,
                executionCount: 0,
                totalDuration: 0,
                minDuration: undefined,
                maxDuration: undefined,
            };
            this.measurementsMap.set(dimension, m);
        }
        m.executionCount++;
        m.latestDuration = duration;

        if (this.includeAggregateMetrics) {
            m.totalDuration += duration;
            m.minDuration = m.minDuration === undefined
                ? duration
                : Math.min(m.minDuration, duration);
            m.maxDuration = m.maxDuration === undefined
                ? duration
                : Math.max(m.maxDuration, duration);
        }

        if (m.executionCount >= countThreshold) {
            this.flushDimension(dimension);
        }

        return returnValue;
    }

    private flushDimension(dimension: string) {
        const measurements = this.measurementsMap.get(dimension);
        if (measurements === undefined) {
            return;
        }

        if (measurements.executionCount !== 0) {
            let telemetryEvent: ITelemetryPerformanceEvent = {
                ...this.eventBase,
                ...{
                    duration: measurements.latestDuration,
                    dimension,
                } };

            if (this.includeAggregateMetrics) {
                telemetryEvent = {
                    ...telemetryEvent,
                    ...{
                        aggDuration: measurements.totalDuration,
                        count: measurements.executionCount,
                        aggMinDuration: measurements.minDuration,
                        aggMaxDuration: measurements.maxDuration,
                    },
                };
            }

            this.logger.sendPerformanceEvent(telemetryEvent);
            this.measurementsMap.set(dimension,
                {
                    latestDuration: 0,
                    executionCount: 0,
                    totalDuration: 0,
                    minDuration: undefined,
                    maxDuration: undefined,
                });
        }
    }

    public dispose(error?: Error | undefined): void {
        this.measurementsMap.forEach((_, k) => this.flushDimension(k));
    }
}
