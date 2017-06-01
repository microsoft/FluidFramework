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
    private start: number;
    private samples = 0;
    private value = 0;
    private minimum: number;
    private maximum: number;

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
};
