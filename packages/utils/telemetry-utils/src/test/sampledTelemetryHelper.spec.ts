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
        const helper = new SampledTelemetryHelper({}, logger);
        const threshold = 10;
        for (let i = 0; i < threshold - 1; i++) {
            helper.measure(() => {}, threshold);
        }
        assert.strictEqual(logger.events.length, 0);
        helper.measure(() => {}, threshold);
        assert.strictEqual(logger.events.length, 1);

        // Again to make sure the internal counter is reset correctly
        for (let i = 0; i < threshold - 1; i++) {
            helper.measure(() => {}, threshold);
        }
        assert.strictEqual(logger.events.length, 1);
        helper.measure(() => {}, threshold);
        assert.strictEqual(logger.events.length, 2);
    });

    it("does not include aggregate properties when it shouldn't", () => {
        const helper = new SampledTelemetryHelper({}, logger, false);
        helper.measure(() => {}, 1);
        assert.strictEqual(logger.events.length, 1);
        const event = logger.events[0];
        ensurePropertiesExist(event, ["duration", "dimension"], true);
        assert.strictEqual(event.dimension, "");
    });

    it("includes aggregate properties when it should", () => {
        const helper = new SampledTelemetryHelper({}, logger, true);
        helper.measure(() => {}, 1);
        assert.strictEqual(logger.events.length, 1);
        const event = logger.events[0];
        ensurePropertiesExist(event,
            ["duration", "dimension", "aggDuration", "count", "aggMinDuration", "aggMaxDuration"], true);
        assert.strictEqual(event.dimension, "");
        assert.strictEqual(event.count, 1);
    });

    it("tracks dimensions separately", () => {
        const helper = new SampledTelemetryHelper({}, logger);
        const threshold1 = 10;
        const threshold2 = 3;
        const dimension1 = "dimension1";
        const dimension2 = "dimension2";

        // The dimensions have different thresholds so they'll generate a different number of telemetry events
        for (let i = 0; i < 10; i++) {
            helper.measure(() => {}, threshold1, dimension1);
            helper.measure(() => {}, threshold2, dimension2);
        }

        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension1).length, 1);
        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension2).length, 3);
    });

    it("generates telemetry event from buffered data when disposed", () => {
        const helper = new SampledTelemetryHelper({}, logger);

        // Logging several dimensions to make sure they are all flushed
        const dimension1 = "dimension1";
        const dimension2 = "dimension2";

        // Only measure 4 times when the threshold for writing the telemetry event is 5
        for (let i = 0; i < 4; i++) {
            helper.measure(() => {}, 5, dimension1);
            helper.measure(() => {}, 5, dimension2);
        }

        // Nothing should have been logged yet
        assert.strictEqual(logger.events.length, 0);

        // After disposing, there should be one event for each dimension
        helper.dispose();
        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension1).length, 1);
        assert.strictEqual(logger.events.filter((x) => x.dimension === dimension2).length, 1);
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
