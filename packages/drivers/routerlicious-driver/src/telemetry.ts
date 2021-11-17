import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";

export interface EventSampleRate {
    /**
     * Every {rate[0]} of {rate[1]} events will be sampled.
     * Example: { rate: [2, 5] } will sample 2 of every 5 events.
     */
    rate: [number, number];
    /**
     * Sample events matching this category at this rate.
     * Must match full category name. Case-sensitive.
     */
    category?: string;
    /**
     * Sample events matching this eventName at this rate.
     * Can be full eventName or subset of an eventName. Case-sensitive.
     * Example: { eventName: "event1" } would match an event like { eventName: "namespace:event1" }.
     */
    eventName?: string;
}

/**
 * SamplingLoggerAdapter can add event sampling to a logger.
 */
 export class SamplingLoggerAdapter implements ITelemetryBaseLogger {
    private readonly sampleCountMap: Map<string, number> = new Map();
    private readonly foundSampleRateByEventMap: Map<string, [number, number]> = new Map();

    constructor(
        protected readonly logger: ITelemetryBaseLogger,
        /**
         * Sample rates by event name and category.
         * List in order of precedence, generally most -> least specific.
         * Example: { rate: [2, 5], category: "performance" } will log 2 of every 5 "performance" events.
         */
        private readonly sampleRates: EventSampleRate[],
    ) {
    }

    public send(event: ITelemetryBaseEvent) {
        const sampleRate = this.getSampleRateForEvent(event);
        if (sampleRate === false) {
            return this.logger.send(event);
        }

        const eventKey = this.getSampleMapKey(event);
        const sampleCount = (this.sampleCountMap.get(eventKey) ?? 0) + 1;
        // Send first {sampleRate[0]} of {sampleRate[1]} events.
        if (sampleCount <= sampleRate[0]) {
            this.logger.send(event);
        }
        // Reset count when {sampleRate[1]} events are received.
        if (sampleCount >= sampleRate[1]) {
            this.sampleCountMap.set(eventKey, 0);
        } else {
            this.sampleCountMap.set(eventKey, sampleCount);
        }
    }

    private getSampleRateForEvent(event: ITelemetryBaseEvent): [number, number] | false {
        const eventKey = this.getSampleMapKey(event);
        const foundSampleRateForEvent = this.foundSampleRateByEventMap.get(eventKey);
        if (foundSampleRateForEvent) {
            return foundSampleRateForEvent;
        }
        for (const { rate, eventName, category} of this.sampleRates) {
            let shouldSample = true;
            if (category !== undefined) {
                shouldSample = shouldSample && category === event.category;
            }
            if (eventName !== undefined) {
                shouldSample = shouldSample && event.eventName.includes(eventName);
            }
            if (shouldSample) {
                this.foundSampleRateByEventMap.set(eventKey, rate);
                return rate;
            }
        }
        return false;
    }

    private getSampleMapKey(event: ITelemetryBaseEvent): string {
        return `${event.category}_${event.eventName}`;
    }
}
