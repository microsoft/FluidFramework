/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const performanceNow = require("performance-now") as (() => number);

/**
 * Helper class for tracing performance of events
 */
export class Trace {
    public static start(): Trace {
        const startTick = performanceNow();
        return new Trace(startTick);
    }

    protected lastTick: number;
    protected constructor(public readonly startTick: number) {
        this.lastTick = startTick;
    }

    public trace(): ITraceEvent {
        const tick = performanceNow();
        const event = {
            totalTimeElapsed: tick - this.startTick,
            duration: tick - this.lastTick,
            tick,
        };
        this.lastTick = tick;
        return event;
    }
}

/**
 * Event in a performance trace including time elapsed.
 */
export interface ITraceEvent {
    /**
     * Total time elapsed since the start of the Trace.
     */
    readonly totalTimeElapsed: number;
    /**
     * Time elapsed since the last trace event.
     */
    readonly duration: number;
    /**
     * This number represents a relative time which should
     * be consistent for all trace ticks.
     */
    readonly tick: number;
}
