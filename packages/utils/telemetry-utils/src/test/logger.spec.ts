/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
// eslint-disable-next-line max-len
import { LoggingError, TelemetryLogger, TelemetryDataTag, isTaggedTelemetryPropertyValue, ITaggableTelemetryProperties } from "../logger";

describe("Logger", () => {
    describe("Error Logging", () => {
        describe("prepareErrorObject", () => {
            function freshEvent(): ITelemetryBaseEvent {
                return { category: "cat1", eventName: "event1" };
            }
            function createILoggingError(props: ITaggableTelemetryProperties) {
                return { getTelemetryProperties: () => props };
            }

            it("non-object error added to event", () => {
                let event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, "hello", false);
                assert.strictEqual(event.error, "hello", "string should work");
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, 42, false);
                assert.strictEqual(event.error, 42, "number should work");
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, true, false);
                assert.strictEqual(event.error, true, "boolean should work");
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, undefined, false);
                assert.strictEqual(event.error, undefined, "undefined should work");

                // Technically this violates TelemetryEventPropertyType's type constraint but it's actually supported
                event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, null, false);
                assert.strictEqual(event.error, null, "null should work");
            });
            it("stack and message added to event", () => {
                const event = freshEvent();
                TelemetryLogger.prepareErrorObject(event, new Error("boom"), false);
                assert(event.error === "boom");
                assert((event.stack as string).includes("boom"));
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
                const error = createILoggingError({foo: "foo", bar: 2});
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert(event.foo === "foo" && event.bar === 2);
            });
            it("getTelemetryProperties - tagged TelemetryDataTag.UserData is removed", () => {
                const event = freshEvent();
                const error = createILoggingError(
                    { somePii: { value: "very personal", tag: TelemetryDataTag.UserData }});
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert.strictEqual(event.somePii, undefined, "somePii should not exist on props");
            });
            it("getTelemetryProperties - tagged TelemetryDataTag.None/PackageData are preserved", () => {
                const event = freshEvent();
                const error = createILoggingError({
                    boring: { value: "boring", tag: TelemetryDataTag.None },
                    packageName: { value: "myPkg", tag: TelemetryDataTag.PackageData },
                });
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert.strictEqual(event.boring, "boring");
                assert.strictEqual(event.packageName, "myPkg");
            });
            it("getTelemetryProperties - tagged [unrecognized tag] are removed", () => {
                const event = freshEvent();
                const error = createILoggingError(
                    { somePii: { value: "very personal", tag: "FutureTag" as TelemetryDataTag }});
                TelemetryLogger.prepareErrorObject(event, error, false);
                assert.strictEqual(event.somePii, undefined, "somePii should not exist on props");
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
                assert((event.stack as string).includes("boom"));
            });
            it("fetchStack true - Add a stack if missing", () => {
                const event = freshEvent();
                const error = { message: "I have no stack - boom" };
                TelemetryLogger.prepareErrorObject(event, error, true);
                assert.strictEqual(typeof (event.stack), "string");
                assert(!(event.stack as string).includes("boom"));
            });
        });
        describe("TaggedTelemetryData", () => {
            it("Ensure backwards compatibility", () => {
                // The values of the enum should never change (even if the keys are renamed)
                assert(TelemetryDataTag.None === "None" as TelemetryDataTag);
                assert(TelemetryDataTag.PackageData === "PackageData" as TelemetryDataTag);
                assert(TelemetryDataTag.UserData === "UserData" as TelemetryDataTag);
            });
        });
        describe("isTaggedTelemetryPropertyValue", () => {
            it("non-object value ok", () => {
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: "hello", tag: "None" }), true);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: 123, tag: "None" }), true);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: false, tag: "None" }), true);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: undefined, tag: "None" }), true);
                // The type guard used is a bit imprecise. Here is proof (these "shouldn't" be ok)
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: function x() { return 54; }, tag: "None" }), true);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: Symbol("okay"), tag: "None" }), true);
            });
            it("object or null value not ok", () => {
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: { foo: "bar" }, tag: "None" }), false);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: { }, tag: "None" }), false);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: null, tag: "None" }), false);
            });
            it("non-string tag not ok", () => {
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: "hello", tag: 1 }), false);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: "hello", tag: false }), false);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: "hello", tag: {} }), false);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
                    { value: "hello", tag: null }), false);
                assert.strictEqual(isTaggedTelemetryPropertyValue(
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
                (loggingError as any).p1 = "should be overwritten";
                loggingError.addTelemetryProperties({p1: "one", p4: 4, p5: { value: 5, tag: TelemetryDataTag.None }});
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.p1, "one");
                assert.strictEqual(props.p4, 4);
                assert.deepStrictEqual(props.p5, { value: 5, tag: TelemetryDataTag.None });
                const errorAsAny = loggingError as any;
                assert.strictEqual(errorAsAny.p1, "one");
                assert.strictEqual(errorAsAny.p4, 4);
                assert.deepStrictEqual(errorAsAny.p5, { value: 5, tag: TelemetryDataTag.None });
            });
            it("Set valid props via 'as any' - returned from getTelemetryProperties, overwrites", () => {
                const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
                loggingError.addTelemetryProperties({p1: "should be overwritten"});
                const errorAsAny = loggingError as any;
                errorAsAny.p1 = "one";
                errorAsAny.p4 = 4;
                errorAsAny.p5 = { value: 5, tag: TelemetryDataTag.None };
                errorAsAny.pii6 = { value: 5, tag: TelemetryDataTag.UserData };
                const props = loggingError.getTelemetryProperties();
                assert.strictEqual(props.p1, "one");
                assert.strictEqual(props.p4, 4);
                assert.deepStrictEqual(props.p5, { value: 5, tag: TelemetryDataTag.None });
                assert.deepStrictEqual(props.pii6, { value: 5, tag: TelemetryDataTag.UserData });
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
                assert.strictEqual(props.p5, undefined);
            });
            it("addTelemetryProperties - overwrites base class Error fields (untagged)", () => {
                const loggingError = new LoggingError("myMessage");
                const overwritingProps = { message: "surprise1", stack: "surprise2", name: "surprise3"};
                loggingError.addTelemetryProperties(overwritingProps);
                const props = loggingError.getTelemetryProperties();
                assert.deepStrictEqual(props, overwritingProps);
            });
            it("addTelemetryProperties - overwrites base class Error fields (tagged)", () => {
                const overwritingProps = new LoggingError("myMessage");
                const expectedProps = {
                    message: { value: "surprise1", tag: TelemetryDataTag.None },
                    stack: { value: "surprise2", tag: TelemetryDataTag.None },
                    name: { value: "Mark Fields", tag: TelemetryDataTag.UserData }, // hopefully no one does this! >_<
                };
                overwritingProps.addTelemetryProperties(expectedProps);
                const props = overwritingProps.getTelemetryProperties();
                assert.deepStrictEqual(props, expectedProps);
            });
        });
    });
});
