/**
 * Simple class to help sample rate based counters
 */
export class RateCounter {
    private start: number;
    private value = 0;

    public increment(value: number) {
        this.value += value;
    }

    /**
     * Starts the counter
     */
    public reset() {
        this.value = 0;
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
     * Returns the rate for the counter
     */
    public getRate(): number {
        return this.value / this.elapsed();
    }
};
