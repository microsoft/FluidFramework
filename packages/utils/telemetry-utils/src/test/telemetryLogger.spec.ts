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
    //* ONLY
    describe.only("Properties", () => {
        it("send", () => {
            for (const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.send({ category: "anything", eventName: "whatever" });
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "anything");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                const expectedKeys = [...Object.keys(props?.all ?? {}), "category", "eventName"];
                assert.deepStrictEqual(
                    eventKeys.sort(),
                    expectedKeys.sort(),
                    `event:\n${JSON.stringify(event)}\nprops:\n${props ? JSON.stringify(props) : "undefined"}`);
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
                assert.strictEqual(event.errorType, undefined);
                const eventKeys = Object.keys(event);
                // should include error props too
                const expected = { error: "whatever", ... props?.all, ... props?.error };
                const propsKeys = Object.keys(expected);
                propsKeys.forEach(
                    (k) => {
                        const e = typeof expected[k] === "function" ? expected[k]() : expected[k];
                        assert.strictEqual(
                            event[k],
                            e,
                            `${k} value does not match.
                            actual: ${JSON.stringify(event[k])} expected: ${JSON.stringify(e)}`);
                });
                const expectedKeys = [...propsKeys, "category", "eventName", "errorType", "stack"];
                assert.deepStrictEqual(
                    eventKeys.sort(),
                    expectedKeys.sort(),
                    `event:\n${JSON.stringify(event)}\nprops:\n${props ? JSON.stringify(props) : "undefined"}`);
            }
        });

        it("sendErrorEvent with error field", () => {
            for (const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.sendErrorEvent({ eventName: "whatever", error: "bad" });
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "error");
                assert.strictEqual(event.eventName, "namespace:whatever");
                assert.strictEqual(event.errorType, undefined);
                const eventKeys = Object.keys(event);
                // should include error props too
                const expected = { error: "bad", ... props?.all, ... props?.error };
                const propsKeys = Object.keys(expected);
                propsKeys.forEach(
                    (k) => {
                        const e = typeof expected[k] === "function" ? expected[k]() : expected[k];
                        assert.strictEqual(
                            event[k],
                            e,
                            `${k} value does not match.
                            actual: ${JSON.stringify(event[k])} expected: ${JSON.stringify(e)}`);
                });
                const expectedKeys = [...propsKeys, "category", "eventName", "errorType", "stack"];
                assert.deepStrictEqual(
                    eventKeys.sort(),
                    expectedKeys.sort(),
                    `event:\n${JSON.stringify(event)}\nprops:\n${props ? JSON.stringify(props) : "undefined"}`);
            }
        });

        it("sendErrorEvent with error object", () => {
            for (const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                const error = new Error("badMessage");
                logger.sendErrorEvent({ eventName: "whatever" }, error);
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "error");
                assert.strictEqual(event.eventName, "namespace:whatever");
                assert.strictEqual(event.errorType, undefined);
                const eventKeys = Object.keys(event);
                // should include error props too
                const expected = {
                    error: error.message,
                    ... props?.all,
                    ... props?.error,
                };
                const propsKeys = Object.keys(expected);
                propsKeys.forEach(
                    (k) => {
                        const e = typeof expected[k] === "function" ? expected[k]() : expected[k];
                        assert.strictEqual(
                        event[k],
                        e,
                        `${k} value does not match.
                         actual: ${JSON.stringify(event[k])} expected: ${JSON.stringify(e)}`);
                });
                const expectedKeys = [...propsKeys, "category", "eventName", "errorType", "stack"];
                assert.deepStrictEqual(
                    eventKeys.sort(),
                    expectedKeys.sort(),
                    `event:\n${JSON.stringify(event)}\nprops:\n${props ? JSON.stringify(props) : "undefined"}`);
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
                const expectedKeys = [...propsKeys, "category", "eventName"];
                assert.deepStrictEqual(
                    eventKeys.sort(),
                    expectedKeys.sort(),
                    `event:\n${JSON.stringify(event)}\nprops:\n${props ? JSON.stringify(props) : "undefined"}`);
            }
        });
    });
});
