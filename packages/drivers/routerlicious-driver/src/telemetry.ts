/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent, ITelemetryLogger } from "@fluidframework/common-definitions";

/**
 * Helper class to reduce telemetry noise by aggregating performance events.
 * Aggregate data will be logged, on flush, as sums along with the total count.
 * Optionally, takes a threshold param and will flush each time the threshold is reached.
 */
export class AggregatePerformanceEvent {
    private data: Record<string, number> = {};
    private count: number = 0;

    constructor(
        private readonly event: ITelemetryGenericEvent,
        private readonly threshold?: number,
    ) {
    }

    public push(logger: ITelemetryLogger, data: Record<string, number>) {
        this.count++;
        Object.entries(data).forEach(([key, value]) => {
            this.data[key] = (this.data[key] ?? 0) + value;
        });
        if (this.threshold !== undefined && this.count >= this.threshold) {
            this.flush(logger);
        }
    }

    public flush(logger: ITelemetryLogger) {
        logger.sendPerformanceEvent({
            ...this.event,
            ...this.data,
            count: this.count });
        this.data = {};
        this.count = 0;
    }
}
