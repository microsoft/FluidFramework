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
 * Helper class to monitor throughput
 */
export class ThroughputCounter {
    private produceCounter = new RateCounter();
    private acknowlwedgeCounter = new RateCounter();
    private interval;

    constructor(
        private log: (value: string) => void,
        private prefix = "",
        private intervalTime: number = 5000) {
    }

    public produce(count: number = 1) {
        this.produceCounter.increment(count);
        this.ensureTracking();
    }

    public acknowlwedge(count: number = 1) {
        this.acknowlwedgeCounter.increment(count);
        this.ensureTracking();
    }

    private ensureTracking() {
        if (this.interval) {
            return;
        }

        // Reset both counters when starting the interval
        this.produceCounter.reset();
        this.acknowlwedgeCounter.reset();

        // Kick off the interval
        this.interval = setInterval(() => {
            const produce = 1000 * this.produceCounter.getValue() / this.produceCounter.elapsed();
            const ack = 1000 * this.acknowlwedgeCounter.getValue() / this.acknowlwedgeCounter.elapsed();

            this.log(`${this.prefix}Produce@ ${produce.toFixed(2)} msg/s - Ack@ ${ack.toFixed(2)} msg/s`);

            // If there was no activity within the interval disable it
            if (this.produceCounter.getValue() === 0 && this.acknowlwedgeCounter.getValue() === 0) {
                clearInterval(this.interval);
                this.interval = undefined;
            }

            this.produceCounter.reset();
            this.acknowlwedgeCounter.reset();
        }, this.intervalTime);
    }
}

/**
 * Simple class to help sample rate based counters
 */
export class RateCounter {
    private start: number;
    private samples = 0;
    private value = 0;
    private minimum: number;
    private maximum: number;

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
    public getMinimum(): number {
        return this.minimum;
    }

    /**
     * Maximum value seen
     */
    public getMaximum(): number {
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
