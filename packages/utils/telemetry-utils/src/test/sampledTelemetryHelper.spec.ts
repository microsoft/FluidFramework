/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ITelemetryBaseEvent,
    ITelemetryErrorEvent,
    ITelemetryGenericEvent,
    ITelemetryLogger,
    ITelemetryPerformanceEvent,
} from "@fluidframework/common-definitions";
import { SampledTelemetryHelper } from "../sampledTelemetryHelper";

/**
 * Test logger with only the necessary functionality used by the SampledTelemetryHelper
 * so we can test it.
 */
class TestLogger implements ITelemetryLogger {
    public events: ITelemetryPerformanceEvent[] = [];

    sendPerformanceEvent(event: ITelemetryPerformanceEvent, error?: any): void {
        this.events.push(event);
    }

    send(event: ITelemetryBaseEvent): void {
        throw new Error("Method not implemented.");
    }
    sendTelemetryEvent(event: ITelemetryGenericEvent, error?: any): void {
        throw new Error("Method not implemented.");
    }
    sendErrorEvent(event: ITelemetryErrorEvent, error?: any): void {
        throw new Error("Method not implemented.");
    }
    supportsTags?: true | undefined;
}

describe("SampledTelemetryHelper", () => {
    let logger: TestLogger;

    beforeEach(() => {
        logger = new TestLogger();
    });

    it("only writes event after correct number of samples", () => {
        const sampling = 10;
        const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, sampling);
        for (let i = 0; i < sampling - 1; i++) {
            helper.measure(() => {});
        }
        assert.strictEqual(logger.events.length, 0);
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 1);

        // Again to make sure the internal counter is reset correctly
        for (let i = 0; i < sampling - 1; i++) {
            helper.measure(() => {});
        }
        assert.strictEqual(logger.events.length, 1);
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 2);
    });

    it("does not include aggregate properties when it shouldn't", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 1, false);
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 1);
        const event = logger.events[0];
        ensurePropertiesExist(event, ["eventName", "duration", "dimension"], true);
        assert.strictEqual(event.dimension, "");
    });

    it("includes aggregate properties when it should", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 1, true);
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 1);
        const event = logger.events[0];
        ensurePropertiesExist(event,
            ["eventName", "duration", "dimension", "totalDuration", "count", "minDuration", "maxDuration"], true);
        assert.strictEqual(event.dimension, "");
        assert.strictEqual(event.count, 1);
    });

    it("includes properties from base event when no aggregate properties are included", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent", myProp: "myValue" }, logger, 1, false);
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 1);
        const event = logger.events[0];
        ensurePropertiesExist(event, ["eventName", "duration", "dimension", "myProp"], true);
        assert.strictEqual(event.dimension, "");
    });

    it("includes properties from base event when aggregate properties are included", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent", myProp: "myValue" }, logger, 1, true);
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 1);
        const event = logger.events[0];
        ensurePropertiesExist(event,
            ["eventName", "duration", "dimension", "totalDuration", "count", "minDuration", "maxDuration", "myProp"],
            true);
        assert.strictEqual(event.dimension, "");
    });

    it("tracks dimensions separately", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 3);
        const dimension1 = "dimension1";
        const dimension2 = "dimension2";

        for (let i = 0; i < 9; i++) {
            helper.measure(() => {}, dimension1);
        }
        for (let i = 0; i < 7; i++) {
            helper.measure(() => {}, dimension2);
        }

        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension1).length, 3);
        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension2).length, 2);
    });

    it("generates telemetry event from buffered data when disposed", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 5);

        // Logging several dimensions to make sure they are all flushed
        const dimension1 = "dimension1";
        const dimension2 = "dimension2";

        // Only measure 4 times when we need 5 samples before writing the telemetry event
        for (let i = 0; i < 4; i++) {
            helper.measure(() => {}, dimension1);
            helper.measure(() => {}, dimension2);
        }

        // Nothing should have been logged yet
        assert.strictEqual(logger.events.length, 0);

        // After disposing, there should be one event for each dimension
        helper.dispose();
        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension1).length, 1);
        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension2).length, 1);
    });

    it("no event is generated on dispose if there's no pending 'buffered' data", () => {
        const helper = new SampledTelemetryHelper({ eventName: "testEvent" }, logger, 2);

        // Nothing should have been logged after the first call
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 0);

        // On the second call, we should have 1 event
        helper.measure(() => {});
        assert.strictEqual(logger.events.length, 1);

        // After disposing, there should still be just one event
        helper.dispose();
        assert.strictEqual(logger.events.length, 1);
    });
});

function ensurePropertiesExist(object: unknown, propNames: string[], noExtraProperties: boolean = false) {
    propNames.forEach((name) => {
        assert.strictEqual((object as any)[name] !== undefined, true);
    });

    if (noExtraProperties) {
        const actualNumberOfProps = Object.keys((object as any)).length;
        const expectedNumberOfProps = propNames.length;
        if (actualNumberOfProps !== expectedNumberOfProps) {
            assert.fail(`Object contains unexpected properties ` +
                        `(${actualNumberOfProps} found, ${expectedNumberOfProps}) expected)`);
        }
    }
}
