/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryLoggerPropertyBags, ITelemetryLoggerPropertyBag, TelemetryLogger } from "../logger";

class TestTelemetryLogger extends TelemetryLogger {
    public events: ITelemetryBaseEvent[] = [];
    public send(event: ITelemetryBaseEvent): void {
        this.events.push(this.prepareEvent(event));
    }
}

const allCases: (ITelemetryLoggerPropertyBag)[] =
    [{}, { allProp: 1 }, { allGetter: () => 1 }, { allProp: 1, allGetter: () => 1 }];
const errorCases: (ITelemetryLoggerPropertyBag)[] =
    [{}, { errorProp: 2 }, { errorGetter: () => 2 }, { errorProp: 2, errorGetter: () => 2 }];

const propertyCases: (ITelemetryLoggerPropertyBags | undefined)[] =
    allCases.reduce<ITelemetryLoggerPropertyBags[]>(
        (pv, all) => {
            pv.push(... errorCases.map((error) => ({ all, error })));
            return pv;
        },
        []);
propertyCases.push(...allCases.map((all) => ({ all, error: all })));
propertyCases.push(...allCases);
propertyCases.push(...errorCases);
propertyCases.push(undefined);

describe("TelemetryLogger", () => {
    describe("Properties", () => {
        it("send", () => {
            for (const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.send({ category: "anything", eventName: "whatever" });
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "anything");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                const propsKeys = Object.keys(props?.all ?? {});
                // +2 for category and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 2,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
            }
        });

        it("sendErrorEvent", () => {
            for (const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.sendErrorEvent({ eventName: "whatever" });
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "error");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                // should include error props too
                const propsKeys = Object.keys({ ... props?.all, ... props?.error });
                // +2 for category and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 2,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
            }
        });

        it("sendTelemetryEvent", () => {
            for (const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.sendTelemetryEvent({ eventName: "whatever" });
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "generic");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                const propsKeys = Object.keys(props?.all ?? {});
                // +2 for category and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 2,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
            }
        });
    });
});
