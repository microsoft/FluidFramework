/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { LoggingError, TelemetryLogger, TelemetryDataTag, IsTaggedTelemetryPropertyValue } from "../logger";

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
            it("containsPII (legacy) is ignored", () => {
                // Previously, setting containsPII = true on an error obj would (attempt to) redact its message
                const event = freshEvent();
                const error = new Error("boom");
                (error as any).containsPII = true;
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.error === "boom");
                assert((event.stack as string).includes("boom"));
            });
            it("getTelemetryProperties absent - no further props added", () => {
                const event = freshEvent();
                const error = { foo: "foo", bar: 2 };
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.foo === undefined && event.bar === undefined);
            });
            it("getTelemetryProperties present - add additional props", () => {
                const event = freshEvent();
                const error = { getTelemetryProperties: () => ({foo: "foo", bar: 2}) };
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.foo === "foo" && event.bar === 2);
            });
            it("fetchStack false - Don't add a stack if missing", () => {
                const event = freshEvent();
                const error = { message: "I have no stack" };
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert.strictEqual(event.stack, undefined);
            });
            it("fetchStack true - Don't add a stack if present", () => {
                const event = freshEvent();
                const error = new Error("boom");
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert.strictEqual(typeof (event.stack), "string");
            });
            it("fetchStack true - Add a stack if missing", () => {
                const event = freshEvent();
                const error = { message: "I have no stack" };
                TelemetryLogger.prepareErrorObject(event, error, true);
                assert.strictEqual(typeof (event.stack), "string");
            });
        });
        describe("IsTaggedTelemetryPropertyValue", () => {
            it("non-object value ok", () => {
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: "hello", tag: 0 }), true);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: 123, tag: 0 }), true);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: false, tag: 0 }), true);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: undefined, tag: 0 }), true);
                // The type guard used is a bit imprecise. Here is proof (these "shouldn't" be ok)
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: function x() { return 54; }, tag: 0 }), true);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: Symbol("okay"), tag: 0 }), true);
            });
            it("object or null value not ok", () => {
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: { foo: "bar" }, tag: 0 }), false);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: { }, tag: 0 }), false);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: null, tag: 0 }), false);
            });
            it("non-number tag not ok", () => {
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: "hello", tag: false }), false);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: "hello", tag: {} }), false);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: "hello", tag: null }), false);
                assert.strictEqual(IsTaggedTelemetryPropertyValue(
                    { value: "hello" }), false);
            });
        });
        describe("LoggingError", () => {
            it("ctor props are assigned to the object", () => {
                const loggingError = new LoggingError(
                    "myMessage",
                    { p1: 1, p2: "two", p3: true, tagged: { value: 4, tag: TelemetryDataTag.PackageData }});
                assert.strictEqual(loggingError.name, "Error");
                assert.strictEqual(loggingError.message, "myMessage");
                const errorAsAny = loggingError as any;
                assert.strictEqual(errorAsAny.p1, 1);
                assert.strictEqual(errorAsAny.p2, "two");
                assert.strictEqual(errorAsAny.p3, true);
                assert.deepStrictEqual(errorAsAny.tagged, { value: 4, tag: TelemetryDataTag.PackageData });
            });
            it("getTelemetryProperties extracts all untagged ctor props", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.message, "myMessage");
                assert.strictEqual(typeof props.stack, "string");
                assert.strictEqual(props.name, "Error");
                assert.strictEqual(props.p1, 1);
                assert.strictEqual(props.p2, "two");
                assert.strictEqual(props.p3, true);
            });
            it("addTelemetryProperties - adds to object, returned from getTelemetryProperties, overwrites", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                loggingError.addTelemetryProperties({p1: "one", p4: 4, p5: { value: 5, tag: 0 } });
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.p1, "one");
                assert.strictEqual(props.p4, 4);
                assert.strictEqual(props.p5, 5);
                const errorAsAny = loggingError as any;
                assert.strictEqual(errorAsAny.p1, "one");
                assert.strictEqual(errorAsAny.p4, 4);
                assert.deepStrictEqual(errorAsAny.p5, { value: 5, tag: 0 });
            });
            it("Set valid props via 'as any' - returned from getTelemetryProperties, overwrites", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                const errorAsAny = loggingError as any;
                errorAsAny.p1 = "one";
                errorAsAny.p4 = 4;
                errorAsAny.p5 = { value: 5, tag: 0 };
                errorAsAny.pii6 = { value: 5, tag: 2 };
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.p1, "one");
                assert.strictEqual(props.p4, 4);
                assert.deepStrictEqual(props.p5, 5);
                assert.strictEqual(props.pii6, undefined);
            });
            it("Set invalid props via 'as any' - excluded from getTelemetryProperties, overwrites", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                const errorAsAny = loggingError as any;
                errorAsAny.p1 = { one: 1 };
                errorAsAny.p4 = null;
                errorAsAny.p5 = ["a", "b", "c"];
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.p1, undefined);
                assert.strictEqual(props.p4, undefined);
                assert.deepStrictEqual(props.p5, undefined);
            });
            it("ctor props - overwrites base class Error fields", () => {
                const loggingError = new LoggingError(
                    "myMessage",
                    { message: "surprise1", stack: "surprise2", name: "surprise3"});
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.message, "surprise1");
                assert.strictEqual(props.stack, "surprise2");
                assert.strictEqual(props.name, "surprise3");
            });
            it("getTelemetryProperties - tagged TelemetryDataTag.OtherPii is removed", () => {
                const loggingError = new LoggingError(
                    "myMessage",
                    { somePii: { value: "very personal", tag: TelemetryDataTag.UserData }});
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.somePii, undefined, "somePii should not exist on props");
                assert(typeof ((loggingError as any).somePii) === "object", "somePii should remain on loggingError");
            });
            it("getTelemetryProperties - tagged TelemetryDataTag.None/CodeArtifact are preserved", () => {
                const loggingError = new LoggingError(
                    "myMessage",
                    {
                        boring: { value: "boring", tag: TelemetryDataTag.None },
                        packageName: { value: "myPkg", tag: TelemetryDataTag.PackageData },
                    });
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.boring, "boring");
                assert.strictEqual(props.packageName, "myPkg");
            });
            it("getTelemetryProperties - tagged [unrecognized tag] are removed", () => {
                const loggingError = new LoggingError(
                    "myMessage",
                    { somePii: { value: "very personal", tag: 9999 }});
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.somePii, undefined, "somePii should not exist on props");
                assert(typeof ((loggingError as any).somePii) === "object", "somePii should remain on loggingError");
            });
        });
    });
});
