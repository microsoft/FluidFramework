/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { TelemetryLogger } from "../logger";

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

                // Shouldn't actually be supported (see TelemetryEventPropertyType) but not checked properly in the code
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, [42, "the answer", true], false);
                assert((event.error as unknown as any[]).length === 3, "array should work");
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
                const error = { foo: "foo", bar: 2, getTelemetryProperties };
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.foo === undefined && event.bar === undefined);
            });
            it("fetchStack", () => {});
        });
        describe("LoggingError", () => {
            it("", () => {});
        });
    });
});
