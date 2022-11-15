/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";

/**
 * Utility counter which will send event only if the provided value
 * is above a configured threshold
 */
export class ThresholdCounter {
    public constructor(
        private readonly threshold: number,
        private readonly logger: ITelemetryLogger,
        private thresholdMultiple = threshold,
    ) {}

    /**
     * Sends the value if it's above the treshold.
     */
    public send(eventName: string, value: number) {
        if (value < this.threshold) {
            return;
        }
        this.logger.sendPerformanceEvent({
            eventName,
            value,
        });
    }

    /**
     * Sends the value if it's above the threshold
     * and a multiple of the threshold.
     *
     * To be used in scenarios where we'd like to record a
     * threshold violation while reducing telemetry noise.
     */
    public sendIfMultiple(eventName: string, value: number) {
        if (value === this.thresholdMultiple) {
            this.logger.sendPerformanceEvent({
                eventName,
                value,
            });
            // reduce number of "multiple" events.
            this.thresholdMultiple = this.thresholdMultiple * 2;
        }
    }
}
