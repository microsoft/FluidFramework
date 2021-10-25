/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MockLogger } from "../mockLogger";
import { ThresholdCounter } from "../thresholdCounter";

describe("ThresholdCounter", () => {
    let logger: MockLogger;
    let sender: ThresholdCounter;
    const threshold = 100;

    beforeEach(() => {
        logger = new MockLogger();
        sender = new ThresholdCounter(threshold, logger);
    });

    it("Send only if it passes threshold", () => {
        assert(sender.send("event_1", threshold, { extra: threshold }));
        assert(sender.send("event_2", threshold + 1, { extra: threshold }));
        assert(!sender.send("event_3", threshold - 1));
        assert(!sender.send("event_4", 0));

        assert.strictEqual(logger.events.length, 2);
        assert(logger.matchEvents([{
            eventName: "event_1",
            category: "performance",
            value: threshold,
            extra: threshold,
        }, {
            eventName: "event_2",
            category: "performance",
            value: threshold + 1,
            extra: threshold,
        }]));
    });

    it("Send only if value is multiple", () => {
        assert(sender.sendIfMultiple("event_1", threshold, { extra: threshold }));
        assert(sender.sendIfMultiple("event_2", threshold * 2, { extra: threshold }));
        assert(!sender.sendIfMultiple("event_3", threshold - 1));
        assert(!sender.sendIfMultiple("event_4", 0));

        assert.strictEqual(logger.events.length, 2);
        assert(logger.matchEvents([{
            eventName: "event_1",
            category: "performance",
            value: threshold,
            extra: threshold,
        }, {
            eventName: "event_2",
            category: "performance",
            value: threshold * 2,
            extra: threshold,
        }]));
    });
});
