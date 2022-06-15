/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, ITelemetryPerformanceEvent } from "@fluidframework/common-definitions";

/**
 * Data Store serializer implementation
 */
export class TelemetryHelper {
    public constructor(
        private readonly logger: ITelemetryLogger,
        private readonly threshold: number,
        private readonly eventBase: any,
    ) {
        this.resetAggregates();
    }

    private executionCount: number = 0;
    private totalDuration: number = 0;
    private minDuration: number | undefined;
    private maxDuration: number | undefined;

    /**
     *
     */
     public ExecCode(codeToMeasure: () => any): any {
        const start = performance.now();
        const returnValue = codeToMeasure();
        const duration = performance.now() - start;

        this.totalDuration += duration;
        this.minDuration = this.minDuration === undefined ? duration : Math.min(this.minDuration, duration);
        this.maxDuration = this.maxDuration === undefined ? duration : Math.max(this.maxDuration, duration);
        this.executionCount++;

        if (this.executionCount >= this.threshold) {
            const telemetryEvent: ITelemetryPerformanceEvent = {
                ...this.eventBase,
                ...{
                    duration: this.totalDuration,
                    count: this.executionCount,
                    minDuration: this.minDuration,
                    maxDuration: this.maxDuration,
                } };

            this.logger.sendPerformanceEvent(telemetryEvent);
            this.resetAggregates();
        }

        return returnValue;
    }

    private resetAggregates() {
        this.executionCount = 0;
        this.totalDuration = 0;
        this.minDuration = undefined;
        this.maxDuration = undefined;
    }
}
