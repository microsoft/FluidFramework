/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Computes a histogram of data values
 */
export class Histogram {
    public buckets: number[] = [];

    /**
     * Constructs a new histogram. Increment is used to create buckets for the data
     */
    constructor(public increment: number) {
    }

    /**
     * Adds a new value to the histogram
     */
    public add(value: number) {
        const bucket = Math.floor(value / this.increment);
        this.ensureBucket(bucket);
        this.buckets[bucket]++;
    }

    /**
     * Ensures the given bucket exists
     */
    private ensureBucket(bucket: number) {
        for (let i = this.buckets.length; i <= bucket; i++) {
            this.buckets.push(0);
        }
    }
}

/**
 * Simple class to help sample rate based counters
 */
export class RateCounter {
    private start: number = Date.now();
    private samples = 0;
    private value = 0;
    private minimum: number | undefined;
    private maximum: number | undefined;

    constructor() {
        this.reset();
    }

    public increment(value: number) {
        this.samples++;
        this.value += value;
        this.minimum = this.minimum === undefined ? value : Math.min(this.minimum, value);
        this.maximum = this.maximum === undefined ? value : Math.max(this.maximum, value);
    }

    /**
     * Starts the counter
     */
    public reset() {
        this.value = 0;
        this.samples = 0;
        this.minimum = undefined;
        this.maximum = undefined;
        this.start = Date.now();
    }

    public elapsed(): number {
        return Date.now() - this.start;
    }

    /**
     * Returns the total accumulated value
     */
    public getValue(): number {
        return this.value;
    }

    /**
     * Minimum value seen
     */
    public getMinimum(): number | undefined {
        return this.minimum;
    }

    /**
     * Maximum value seen
     */
    public getMaximum(): number | undefined {
        return this.maximum;
    }

    /**
     * Total number of samples provided to the counter
     */
    public getSamples(): number {
        return this.samples;
    }

    /**
     * Returns the rate for the counter
     */
    public getRate(): number {
        return this.value / this.elapsed();
    }
}

/**
 * Helper class to monitor throughput
 */
export class ThroughputCounter {
    private readonly produceCounter = new RateCounter();
    private readonly acknowledgeCounter = new RateCounter();
    private interval;

    constructor(
        private readonly log: (value: string) => void,
        private readonly prefix = "",
        private readonly intervalTime: number = 5000) {
    }

    public produce(count: number = 1) {
        this.produceCounter.increment(count);
        this.ensureTracking();
    }

    public acknowledge(count: number = 1) {
        this.acknowledgeCounter.increment(count);
        this.ensureTracking();
    }

    private ensureTracking() {
        if (this.interval !== undefined) {
            return;
        }

        // Reset both counters when starting the interval
        this.produceCounter.reset();
        this.acknowledgeCounter.reset();

        // Kick off the interval
        this.interval = setInterval(() => {
            const produce = 1000 * this.produceCounter.getValue() / this.produceCounter.elapsed();
            const ack = 1000 * this.acknowledgeCounter.getValue() / this.acknowledgeCounter.elapsed();

            this.log(`${this.prefix}Produce@ ${produce.toFixed(2)} msg/s - Ack@ ${ack.toFixed(2)} msg/s`);

            // If there was no activity within the interval disable it
            if (this.produceCounter.getValue() === 0 && this.acknowledgeCounter.getValue() === 0) {
                clearInterval(this.interval);
                this.interval = undefined;
            }

            this.produceCounter.reset();
            this.acknowledgeCounter.reset();
        }, this.intervalTime);
    }
}
