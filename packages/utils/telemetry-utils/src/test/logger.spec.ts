/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { LoggingError, TelemetryLogger } from "../logger";

describe("Logger", () => {
    describe("Error Logging", () => {
        describe("prepareErrorObject", () => {
            function freshEvent(): ITelemetryBaseEvent {
                return { category: "cat1", eventName: "event1" };
            }

            it("non-object error added to event", () => {
                let event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, "hello", false);
                assert(event.error === "hello", "string should work");
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, 42, false);
                assert(event.error === 42, "number should work");
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, true, false);
                assert(event.error === true, "boolean should work");

                // Technically this violates TelemetryEventPropertyType's type constraint but it's actually supported
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, null, false);
                assert(event.error === null, "null should work");
            });
            it("stack and message added to event", () => {
                const event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, new Error("boom"), false);
                assert(event.error === "boom");
                assert(!!event.stack);
            });
            it("containsPII respected", () => {
                const event = freshEvent();
                const error = new Error("boom");
                (error as any).containsPII = true;
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.error !== "boom");
            });
            it("getTelemetryProperties absent - no further props added", () => {
                const event = freshEvent();
                const error = { foo: "foo", bar: 2 };
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.foo === undefined && event.bar === undefined);
            });
            it("getTelemetryProperties present", () => {
                const event = freshEvent();
                const error = { foo: "foo", bar: 2, getTelemetryProperties: () => ({}) };
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.foo === undefined && event.bar === undefined);
            });
            it("fetchStack", () => {});
        });
        describe("LoggingError", () => {
            it("props are assigned to the object which extends Error", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                assert.strictEqual(loggingError.name, "Error");
                assert.strictEqual(loggingError.message, "myMessage");
                const errorAsAny = loggingError as any;
                assert.strictEqual(errorAsAny.p1, 1);
                assert.strictEqual(errorAsAny.p2, "two");
                assert.strictEqual(errorAsAny.p3, true);
            });
            it("getTelemetryProperties extracts all props", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.message, "myMessage");
                assert.strictEqual(typeof props.stack, "string");
                assert.strictEqual(props.name, undefined, "Error's name prop is not cloned by getTelemetryProperties");
                assert.strictEqual(props.p1, 1);
                assert.strictEqual(props.p2, "two");
                assert.strictEqual(props.p3, true);
            });
        });
    });
});
