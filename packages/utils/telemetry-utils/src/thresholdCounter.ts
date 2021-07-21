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
    ) {}

    /**
     * Sends the value if it's above the treshold.
     */
    public send(eventName: string, value?: number) {
        this.sendInternal(eventName, value);
    }

    /**
     * Sends the value if it's above the treshold
     * and a multiple of the threshold.
     *
     * To be used in scenarios where we'd like to record a
     * threshold violation while reducing telemetry noise.
     */
    public sendIfMultiple(eventName: string, value?: number) {
        this.sendInternal(eventName, value, 0);
    }

    private sendInternal(event: string, value?: number, delta?: number) {
        if (value === undefined || value < this.threshold) {
            return;
        }

        if (delta === undefined || value % this.threshold === delta) {
            this.logger.sendPerformanceEvent({
                eventName: event,
                value,
            });
        }
    }
}
