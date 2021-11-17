/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { SamplingLoggerAdapter } from "../telemetry";

class MockBaseLogger implements ITelemetryBaseLogger {
    private readonly _events: ITelemetryBaseEvent[] = [];

    public send(event: ITelemetryBaseEvent): void {
        this._events.push(event);
    }

    public getEvents(filter?: { eventName?: string, category?: string }) {
        let events = [ ...this._events ];
        if (filter) {
            if (filter.category) {
                events = events.filter((event) => event.eventName === filter.eventName);
            }
            if (filter.category) {
                events = events.filter((event) => event.category === filter.category);
            }
        }
        return events;
    }

    public clearEvents() {
        this._events.splice(0, this._events.length);
    }
}

describe("SamplingLoggerAdapter", () => {
    const mockLogger = new MockBaseLogger();
    const genericEvent1 = { eventName: "event1", category: "generic" };
    const errorEvent1 = { eventName: "error1", category: "error" };
    const performanceEvent1 = { eventName: "perf1", category: "performance" };
    const performanceEvent2 = { eventName: "perf2", category: "performance" };

    beforeEach(() => {
        mockLogger.clearEvents();
    });
    it("Logs all events", () => {
        const logger = new SamplingLoggerAdapter(mockLogger, []);
        const totalEvents = 4;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, totalEvents);
    });
    it("Logs sample of all events", () => {
        const logger = new SamplingLoggerAdapter(mockLogger, [{ rate: [1, 4] }]);
        const totalEvents = 8;
        const expectedSampleEvents = 2;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, expectedSampleEvents);
    });
    it("Logs sample of specified category events", () => {
        const logger = new SamplingLoggerAdapter(mockLogger, [
            { rate: [1, 10], category: "performance"},
            { rate: [2, 10], category: "error"},
        ]);
        const totalEvents = 10;
        const expectedErrorSampleEvents = 2;
        const expectedPerformanceSampleEvents = 1;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, expectedErrorSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedPerformanceSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, expectedPerformanceSampleEvents);
    });
    it("Logs sample of specified eventName events", () => {
        const logger = new SamplingLoggerAdapter(
            mockLogger,
            [
                { rate: [6, 10], eventName: "event1"},
                { rate: [3, 10], eventName: "perf1"},
            ]);
        const totalEvents = 10;
        const expectedEvent1SampleEvents = 6;
        const expectedPerf1SampleEvents = 3;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, expectedEvent1SampleEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedPerf1SampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, totalEvents);
    });
    it("Logs sample of specified eventName+category events", () => {
        const logger = new SamplingLoggerAdapter(
            mockLogger,
            [
                { rate: [2, 5], eventName: "perf1", category: "performance" },
                { rate: [2, 5], eventName: "perf2", category: "error" },
                { rate: [4, 5] },
            ]);
        const totalEvents = 10;
        const expectedPerf1SampleEvents = 4;
        const expectedOtherSampleEvents = 8;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, expectedOtherSampleEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, expectedOtherSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedPerf1SampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, expectedOtherSampleEvents);
    });
});
