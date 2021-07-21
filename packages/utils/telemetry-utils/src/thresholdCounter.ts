/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";

export class ThresholdCounter {
    public constructor(
        private readonly threshold: number,
        private readonly logger: ITelemetryLogger,
    ) {}

    public send(event: string, count?: number) {
        this.sendInternal(event, count);
    }

    public sendIfMultiple(event: string, count?: number) {
        this.sendInternal(event, count, 0);
    }

    private sendInternal(event: string, count?: number, delta?: number) {
        if (count === undefined || count < this.threshold) {
            return;
        }

        if (delta === undefined || count % this.threshold === delta) {
            this.logger.sendPerformanceEvent({
                eventName: event,
                value: count,
            });
        }
    }
}
