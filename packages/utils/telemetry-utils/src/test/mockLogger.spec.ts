/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "../mockLogger";

describe("MockLogger", () => {
    describe("matchEvents", () => {
        let mockLogger: MockLogger;
        beforeEach(() => {
            mockLogger = new MockLogger();
        });

        it("empty log, none expected", () => {
            assert(mockLogger.matchEvents([]));
        });

        it("empty log, one expected", () => {
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 1 },
            ]));
        });

        it("One logged, none expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(mockLogger.matchEvents([]));
        });

        it("One logged, exact match expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(mockLogger.matchEvents([
                { eventName: "A", a: 1 },
            ]));
        });

        it("One logged, partial match expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(mockLogger.matchEvents([
                { eventName: "A" },
            ]));
        });

        it("One logged, superset expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 1, x: 0 },
            ]));
        });

        it("One logged, unmatching expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 999 },
            ]));
        });

        it("One logged, reordered exact match expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(mockLogger.matchEvents([
                { a: 1, eventName: "A" },
            ]));
        });

        it("One logged, two expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
            ]));
        });

        it("Two logged, two matching expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
            ]));
        });

        it("Two logged, some unmatching expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 999 },
            ]));
        });

        it("Two logged, one matching expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(mockLogger.matchEvents([
                { eventName: "B", b: 2 },
            ]));
        });

        it("Two logged, two matching out of order expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(!mockLogger.matchEvents([
                { eventName: "B", b: 2 },
                { eventName: "A", a: 1 },
            ]));
        });

        it("Two logged, none expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(mockLogger.matchEvents([]));
        });

        it("Two sequences, matching expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
            ]));
            mockLogger.sendTelemetryEvent({ eventName: "C", c: 3 });
            mockLogger.sendTelemetryEvent({ eventName: "D", d: 4 });
            assert(mockLogger.matchEvents([
                { eventName: "C", c: 3 },
                { eventName: "D", d: 4 },
            ]));
        });

        it("Two sequences, redundant match expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
            ]));
            mockLogger.sendTelemetryEvent({ eventName: "C", c: 3 });
            mockLogger.sendTelemetryEvent({ eventName: "D", d: 4 });
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
                { eventName: "C", c: 3 },
                { eventName: "D", d: 4 },
            ]));
        });

        it("One sequence, redundant match expected", () => {
            mockLogger.sendTelemetryEvent({ eventName: "A", a: 1 });
            mockLogger.sendTelemetryEvent({ eventName: "B", b: 2 });
            assert(mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
            ]));
            assert(!mockLogger.matchEvents([
                { eventName: "A", a: 1 },
                { eventName: "B", b: 2 },
            ]));
        });
   });
});
