/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryPerformanceEvent } from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";

class Measurements {
    public executionCount: number = 0;
    public totalDuration: number = 0;
    public minDuration: number | undefined;
    public maxDuration: number | undefined;

    public reset() {
        this.executionCount = 0;
        this.totalDuration = 0;
        this.minDuration = undefined;
        this.maxDuration = undefined;
    }
}

/**
 * Maps a given identifier for a code block that is being subject to telemetry aggregation,
 * to the runtime measurements for said code block.
 */
const statsMap: Map<symbol, Measurements> = new Map<symbol, Measurements>();

/**
 * Executes the specified code block and keeps track of aggregated telemetry measurements
 * (number of executions, total duration, min duration, max duration). Writes a telemetry
 * performance event to the specified logger when the specified number of executions is reached.
 *
 * @param codeBlockId - Unique identifier for the code block to be measured.
 * @param codeToMeasure - The code to be executed and measured.
 * @param countThreshold - The telemetry performance event with aggregated data will be
 *                         generated after this many executions of the code block.
 * @param eventBase - Properties to be included in the telemetry performance
 *                    event when it is sent.
 * @param logger - The logger to use to write the telemetry performance event.
 * @returns Whatever the passed-in code block returns.
 *
 * @remarks
 * It is up to the caller to ensure that the correct symbol is passed in order to aggregate the
 * same code block correctly. Note that `Symbol('some-id')` called twice will produce different
 * symbols, and passing those to this function with the same code block will result in two
 * separate trackings. This helps to prevent collisions between different users of this function,
 * but also makes it easy for callers to decide if they want to track, for example,
 * executions from all instances of a given class in a single aggregation, or if each instance
 * should track separately (keep the symbol as a static property of the class, or an instance
 * property, respectively).
 */
export function ExecuteWithAggregatedTelemetry(
    codeBlockId: symbol,
    codeToMeasure: () => any,
    countThreshold: number,
    eventBase: any,
    logger: ITelemetryLogger): any {
    let stats = statsMap.get(codeBlockId);
    if (stats === undefined) {
        stats = new Measurements();
        statsMap.set(codeBlockId, stats);
    }

    const start = performance.now();
    const returnValue = codeToMeasure();
    const duration = performance.now() - start;

    stats.executionCount++;
    stats.totalDuration += duration;
    stats.minDuration = stats.minDuration === undefined
        ? duration
        : Math.min(stats.minDuration, duration);
    stats.maxDuration = stats.maxDuration === undefined
        ? duration
        : Math.max(stats.maxDuration, duration);

    if (stats.executionCount >= countThreshold) {
        const telemetryEvent: ITelemetryPerformanceEvent = {
            ...eventBase,
            ...{
                duration: stats.totalDuration,
                count: stats.executionCount,
                minDuration: stats.minDuration,
                maxDuration: stats.maxDuration,
            } };

        logger.sendPerformanceEvent(telemetryEvent);
        stats.reset();
    }

    return returnValue;
}
