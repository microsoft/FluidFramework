/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview A chronometer implementation backed by a high resolution timer. Implementation
 *   falls back to milliseconds precision when high resolution timers are not supported.
 */

declare let process: any;

/**
 * All the chronometer implementations (hrtime, window.performance, and date:
 */
const implementations = {
    // Node implementation uses hrtime
    node: {
        name: "hrtime",
        _startTime: 0,
        _stopTime: undefined as any[] | undefined,
        stop: () => { },

        _start() {
            this._startTime = process.hrtime();
        },
        _stop() {
            this._stopTime = process.hrtime(this._startTime);
        },
        _elapsedSec(): number {
            if (this._stopTime === undefined) {
                this.stop();
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return (this._stopTime![0] as number) + (this._stopTime![1] as number) / 1000000000;
        },
        _elapsedMilliSec(): number {
            if (this._stopTime === undefined) {
                this.stop();
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this._stopTime![0] * 1000 + this._stopTime![1] / 1000000;
        },
        _elapsedMicroSec(): number {
            if (this._stopTime === undefined) {
                this.stop();
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return this._stopTime![0] * 1000000 + this._stopTime![1] / 1000;
        },
    },
    // Browser implementation uses window.performance (if available):
    performance: {
        name: "window.performance",
        _startTime: 0,
        _stopTime: 0,

        stop: () => { },
        elapsedMilliSec: () => 0,

        _start() {
            this._startTime = window.performance.now();
        },
        _stop() {
            this._stopTime = window.performance.now();
        },
        _elapsedSec(): number {
            if (!this._stopTime) {
                this.stop();
            }
            return this.elapsedMilliSec() / 1000;
        },
        _elapsedMilliSec(): number {
            if (!this._stopTime) {
                this.stop();
            }
            return this._stopTime - this._startTime;
        },
        _elapsedMicroSec(): number {
            if (!this._stopTime) {
                this.stop();
            }
            return this.elapsedMilliSec() * 1000;
        },
    },
    // Fallback is Date implementation if none of the above is supported:
    date: {
        name: "date",
        _startTime: new Date(),
        _stopTime: undefined as Date | undefined,
        stop: () => { },
        elapsedMilliSec: () => 0,

        _start() {
            this._startTime = new Date();
        },
        _stop() {
            this._stopTime = new Date();
        },
        _elapsedSec(): number {
            if (!this._stopTime) {
                this.stop();
            }
            return this.elapsedMilliSec() / 1000;
        },
        _elapsedMilliSec(): number {
            if (!this._stopTime) {
                this.stop();
            }
            return (this._stopTime as Date).getTime() - this._startTime.getTime();
        },
        _elapsedMicroSec(): number {
            if (!this._stopTime) {
                this.stop();
            }
            return this.elapsedMilliSec() * 1000;
        },
    },
};

let impl: typeof implementations.date | typeof implementations.node | typeof implementations.performance;
if (typeof process !== "undefined" && typeof process.hrtime !== "undefined") {
    impl = implementations.node;
} else if (
    typeof window !== "undefined" &&
    typeof window.performance !== "undefined" &&
    typeof window.performance.now !== "undefined"
) {
    impl = implementations.performance;
} else {
    impl = implementations.date;
}

/**
 * Creates and starts a new Chronometer.
 */

export class Chronometer {
    constructor() {
        this.start();
    }

    /**
     * Sets the chronometer start time.
     */
    start() {
        return impl._start.call(this);
    }

    /**
     * Stops the chronometer. Stopped chronometers can be reused by calling {@link Chronometer.start} again.
     *
     * @returns The chronometer instance, so that callers can do this:
     *   let elapsedMS = chrono.stop().elapsedMS();
     */
    stop(): Chronometer {
        impl._stop.call(this);
        return this;
    }

    /**
     * @returns How many microseconds have elapsed between the last call to {@link Chronometer.start}
     *   (or the chronometer creation), and {@link Chronometer.stop}. Implementations that are not precise
     *   enough may return "elapsedMilliSec() * 1000". Measuring elapsed time causes the chronometer
     *   to be stopped if required (if the chrono is not stopped when this method is called).
     */
    elapsedMicroSec(): number {
        return impl._elapsedMicroSec.call(this);
    }

    /**
     * @returns How many milliseconds have elapsed between the last call to {@link Chronometer.start}
     *   (or the chronometer creation), and {@link Chronometer.stop}. Measuring elapsed time causes the
     *   chronometer to be stopped if required (if the chrono is not stopped when this method is
     *   called).
     */
    elapsedMilliSec(): number {
        return impl._elapsedMilliSec.call(this);
    }

    /**
     * @returns How many seconds have elapsed between the last call to {@link Chronometer.start}
     *   (or the chronometer creation), and {@link Chronometer.stop}. Measuring elapsed time causes the
     *   chronometer to be stopped if required (if the chrono is not stopped when this method is
     *   called).
     */
    elapsedSec(): number {
        return impl._elapsedSec.call(this);
    }

    /**
     * A utility function to measure promise execution time.
     * @param promiseFn - A function that returns a promise whose execution time is to be
     *   measured.
     * @returns A Promise that resolves with an object with properties:
     *    - chrono A stopped chronometer instance from which to get the elapsed time,
     *    - result The resolved result of the promise returned by promiseFn
     */
    static async timePromise<T>(promiseFn: () => Promise<T>): Promise<{ chrono: Chronometer; result: T; }> {
        const chrono = new Chronometer();
        const result = await promiseFn();
        chrono.stop();
        return { chrono, result };
    }
}
