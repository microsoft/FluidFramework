/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { SamplingLoggerAdapter } from "../logger";

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

describe.only("SamplingLoggerAdapter", () => {
    const mockLogger = new MockBaseLogger();
    const genericEvent1 = { eventName: "event1", category: "generic" };
    const errorEvent1 = { eventName: "error1", category: "error" };
    const performanceEvent1 = { eventName: "perf1", category: "performance" };
    const performanceEvent2 = { eventName: "perf2", category: "performance" };

    beforeEach(() => {
        mockLogger.clearEvents();
    });
    it("Logs all events", () => {
        const logger = new SamplingLoggerAdapter(mockLogger, [1, 4], [], []);
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
        const logger = new SamplingLoggerAdapter(mockLogger, [1, 4]);
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
        const logger = new SamplingLoggerAdapter(mockLogger, [1, 10], ["performance"]);
        const totalEvents = 10;
        const expectedSampleEvents = 1;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, expectedSampleEvents);
    });
    it("Logs sample of specified eventName events", () => {
        const logger = new SamplingLoggerAdapter(mockLogger, [6, 10], undefined, ["event1", "perf1"]);
        const totalEvents = 10;
        const expectedSampleEvents = 6;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, totalEvents);
    });
    it("Logs sample of specified eventName+category events", () => {
        const logger = new SamplingLoggerAdapter(
            mockLogger,
            [2, 5],
            ["performance", "error"],
            ["event1", "perf1", "error1"]);
        const totalEvents = 10;
        const expectedSampleEvents = 4;
        for (let i = 0; i < totalEvents; i++) {
            logger.send(genericEvent1);
            logger.send(errorEvent1);
            logger.send(performanceEvent1);
            logger.send(performanceEvent2);
        }
        assert.strictEqual(mockLogger.getEvents(genericEvent1).length, totalEvents);
        assert.strictEqual(mockLogger.getEvents(errorEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent1).length, expectedSampleEvents);
        assert.strictEqual(mockLogger.getEvents(performanceEvent2).length, totalEvents);
    });
});
