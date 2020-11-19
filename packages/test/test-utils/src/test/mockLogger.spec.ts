/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
   });
});
