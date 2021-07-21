/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ITelemetryBaseEvent,
    ITelemetryErrorEvent,
    ITelemetryPerformanceEvent,
    ITelemetryGenericEvent,
    ITelemetryLogger,
} from "@fluidframework/common-definitions";
import { ThresholdTelemetrySender } from "../thresholdTelemetrySender";

class FakeTelemetryLogger implements ITelemetryLogger {
    public events: ITelemetryGenericEvent[] = [];

    public send(_event: ITelemetryBaseEvent): void {
        assert.fail("Should not be called");
    }

    public sendTelemetryEvent(_event: ITelemetryGenericEvent, _error?: any) {
        assert.fail("Should not be called");
    }

    public sendErrorEvent(_event: ITelemetryErrorEvent, _error?: any) {
        assert.fail("Should not be called");
    }

    public sendPerformanceEvent(event: ITelemetryPerformanceEvent, _error?: any): void {
        this.events.push(event);
    }
}

describe("ThresholdTelemetrySender", () => {
    let logger: FakeTelemetryLogger;
    let sender: ThresholdTelemetrySender;
    const threshold = 100;

    beforeEach(() => {
        logger = new FakeTelemetryLogger();
        sender = new ThresholdTelemetrySender(threshold, logger);
    });

    it("Send only if it passes threshold", () => {
        sender.send("event_1", threshold);
        sender.send("event_2", threshold + 1);
        sender.send("event_3", threshold - 1);
        sender.send("event_4", 0);

        assert.strictEqual(logger.events.length, 2);
        assert.strictEqual(logger.events[0], { event : "event_1", threshold });
        assert.strictEqual(logger.events[1], { event : "event_1", threshold + 1 });
    });

    it("Send only if value is multiple", () => {
        sender.sendIfMultiple("event_1", threshold);
        sender.sendIfMultiple("event_2", threshold * 2);
        sender.sendIfMultiple("event_3", threshold - 1);
        sender.sendIfMultiple("event_4", 0);

        assert.strictEqual(logger.events.length, 2);
        assert.strictEqual(logger.events[0], {});
        assert.strictEqual(logger.events[1], {});
    });
});
