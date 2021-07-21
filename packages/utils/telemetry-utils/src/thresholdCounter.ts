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
     * Sends the value if it's above the treshold
     */
    public send(eventName: string, value?: number) {
        this.sendInternal(eventName, value);
    }

    /**
     * Sends the value if it's above the treshold
     * and a multiple of the threshold.
     */
    public sendIfMultiple(eventName: string, value?: number) {
        this.sendInternal(eventName, value, 0);
    }

    private sendInternal(event: string, val?: number, delta?: number) {
        if (val === undefined || val < this.threshold) {
            return;
        }

        if (delta === undefined || val % this.threshold === delta) {
            this.logger.sendPerformanceEvent({
                eventName: event,
                value: val,
            });
        }
    }
}
