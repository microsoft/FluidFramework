/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import sinon from "sinon";
import { ITelemetryBaseEvent, ITelemetryProperties } from "@fluidframework/common-definitions";
import { TelemetryDataTag, TelemetryLogger } from "../logger";
import { LoggingError, isTaggedTelemetryPropertyValue, normalizeError, annotateErrorObject, FluidErrorAnnotations } from "../errorLogging";
import { IFluidErrorBase } from "../staging";
import * as helpers from "../errorLoggingInternalHelpers";

describe("Error Logging", () => {
    describe("TelemetryLogger.prepareErrorObject", () => {
        function freshEvent(): ITelemetryBaseEvent {
            return { category: "cat1", eventName: "event1" };
        }
        function createILoggingError(props: ITelemetryProperties) {
            return {...props, getTelemetryProperties: () => props };
        }

        it("non-object error added to event", () => {
            let event = freshEvent();
            TelemetryLogger.prepareErrorObject(event, "hello", false);
            assert.strictEqual(event.error, "hello", "string should work");
            event = freshEvent();
            TelemetryLogger.prepareErrorObject(event, 42, false);
            assert.strictEqual(event.error, "42", "number should work");
            event = freshEvent();
            TelemetryLogger.prepareErrorObject(event, true, false);
            assert.strictEqual(event.error, "true", "boolean should work");
            event = freshEvent();
            TelemetryLogger.prepareErrorObject(event, undefined, false);
            assert.strictEqual(event.error, "undefined", "undefined should work");

            // Technically this violates TelemetryEventPropertyType's type constraint but it's actually supported
            event = freshEvent();
            TelemetryLogger.prepareErrorObject(event, null, false);
            assert.strictEqual(event.error, "null", "null should work");
        });
        it("stack and message added to event (stack should exclude message)", () => {
            const event = freshEvent();
            const error = new Error("boom");
            error.name = "MyErrorName";
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert(event.error === "boom");
            assert((event.stack as string).includes("MyErrorName"));
            assert(!(event.stack as string).includes("boom"));
        });
        it("containsPII (legacy) is ignored", () => {
            // Previously, setting containsPII = true on an error obj would (attempt to) redact its message
            const event = freshEvent();
            const error = new Error("boom");
            error.name = "MyErrorName";
            (error as any).containsPII = true;
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert(event.error === "boom");
            assert((event.stack as string).includes("MyErrorName"));
        });
        it("getTelemetryProperties absent - no further props added", () => {
            const event = freshEvent();
            const error = { ...new Error("boom"), foo: "foo", bar: 2 };
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert(event.foo === undefined && event.bar === undefined);
        });
        it("getTelemetryProperties overlaps event - do not overwrite", () => {
            const event = { ...freshEvent(), foo: "event_foo", bar: 42 };
            const error = createILoggingError({foo: "error_foo", bar: -1});
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert(event.foo === "event_foo" && event.bar === 42);
        });
        it("getTelemetryProperties present - add additional props", () => {
            const event = freshEvent();
            const error = createILoggingError({foo: "foo", bar: 2});
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert(event.foo === "foo" && event.bar === 2);
        });
        it("getTelemetryProperties - tagged UserData is removed", () => {
            const event = freshEvent();
            const error = createILoggingError(
                { somePii: { value: "very personal", tag: "UserData" }});
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert.strictEqual(event.somePii, "REDACTED (UserData)", "somePii should be redacted");
        });
        it("getTelemetryProperties - tagged PackageData are preserved", () => {
            const event = freshEvent();
            const error = createILoggingError({
                packageName: { value: "myPkg", tag: "PackageData" },
            });
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert.strictEqual(event.packageName, "myPkg");
        });
        it("getTelemetryProperties - tagged [unrecognized tag] are removed", () => {
            const event = freshEvent();
            const error = createILoggingError(
                { somePii: { value: "very personal", tag: "FutureTag"}});
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert.strictEqual(event.somePii, "REDACTED (unknown tag)", "somePii should be redacted");
        });
        it("getTelemetryProperties - tags on overwritten Error base props", () => {
            const event = freshEvent();
            const error = createILoggingError({
                message: { value: "Mark Fields", tag: "UserData" }, // hopefully no one does this!
                stack: { value: "tagged", tag: "PackageData" },
            });
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert.strictEqual(event.message, "REDACTED (UserData)");
            assert.deepStrictEqual(event.error, "[object Object]"); // weird but ok
            assert.deepStrictEqual(event.stack, "tagged"); // weird but ok
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
            error.name = "MyName";
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert((event.stack as string).includes("MyName"));
        });
        it("fetchStack true - Add a stack if missing", () => {
            const event = freshEvent();
            const error = { message: "I have no stack - boom", name: "MyName" };
            TelemetryLogger.prepareErrorObject(event, error, true);
            assert.strictEqual(typeof (event.stack), "string");
            assert(!(event.stack as string).includes("MyName"));
        });
    });
    describe("TaggedTelemetryData", () => {
        it("Ensure backwards compatibility", () => {
            // The values of the enum should never change (even if the keys are renamed)
            assert(TelemetryDataTag.PackageData === "PackageData" as TelemetryDataTag);
            assert(TelemetryDataTag.UserData === "UserData" as TelemetryDataTag);
        });
    });
    describe("isTaggedTelemetryPropertyValue", () => {
        it("non-object input not ok", () => {
            assert.strictEqual(isTaggedTelemetryPropertyValue("hello"), false);
            assert.strictEqual(isTaggedTelemetryPropertyValue(123), false);
            assert.strictEqual(isTaggedTelemetryPropertyValue(false), false);
            assert.strictEqual(isTaggedTelemetryPropertyValue(undefined), false);
            assert.strictEqual(isTaggedTelemetryPropertyValue(null), false);
            assert.strictEqual(isTaggedTelemetryPropertyValue(function x() { return 54; }), false);
            assert.strictEqual(isTaggedTelemetryPropertyValue(Symbol("okay")), false);
        });
        it("non-object value ok", () => {
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: "hello", tag: "any string" }), true);
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: 123, tag: "any string" }), true);
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: false, tag: "any string" }), true);
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: undefined, tag: "any string" }), true);
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { tag: "any string" }), true, "value prop may be absent");
            // The type guard used is a bit imprecise. Here is proof (these "shouldn't" be ok)
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: function x() { return 54; }, tag: "any string" }), true);
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: Symbol("okay"), tag: "any string" }), true);
        });
        it("object or null value not ok", () => {
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: { foo: "bar" }, tag: "any string" }), false, "object value not ok");
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: { }, tag: "any string" }), false, "object value not ok");
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: null, tag: "any string" }), false, "null value not ok");
        });
        it("non-string tag not ok", () => {
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: "hello", tag: 1 }), false, "number tag is bad");
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: "hello", tag: false }), false, "boolean tag is bad");
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: "hello", tag: {} }), false, "object tag is bad");
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: "hello", tag: null }), false, "null tag is bad");
            assert.strictEqual(isTaggedTelemetryPropertyValue(
                { value: "hello" }), false, "undefined (missing) tag is bad");
        });
    });
    describe("LoggingError", () => {
        it("ctor props are assigned to the object", () => {
            const loggingError = new LoggingError(
                "myMessage",
                { p1: 1, p2: "two", p3: true, tagged: { value: 4, tag: "PackageData" }});
            const errorAsAny = loggingError as any;
            assert.strictEqual(errorAsAny.message, "myMessage");
            assert.strictEqual(errorAsAny.p1, 1);
            assert.strictEqual(errorAsAny.p2, "two");
            assert.strictEqual(errorAsAny.p3, true);
            assert.deepStrictEqual(errorAsAny.tagged, { value: 4, tag: "PackageData" });
        });
        it("getTelemetryProperties extracts all untagged ctor props", () => {
            const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
            const props = loggingError.getTelemetryProperties();
            assert.strictEqual(props.message, "myMessage");
            assert.strictEqual(typeof props.stack, "string");
            assert.strictEqual(props.name, undefined); // Error.name is not logged
            assert.strictEqual(props.p1, 1);
            assert.strictEqual(props.p2, "two");
            assert.strictEqual(props.p3, true);
        });
        it("addTelemetryProperties - adds to object, returned from getTelemetryProperties, overwrites", () => {
            const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
            (loggingError as any).p1 = "should be overwritten";
            loggingError.addTelemetryProperties(
                {p1: "one", p4: 4, p5: { value: 5, tag: "PackageData" }});
            const props = loggingError.getTelemetryProperties();
            assert.strictEqual(props.p1, "one");
            assert.strictEqual(props.p4, 4);
            assert.deepStrictEqual(props.p5, { value: 5, tag: "PackageData" });
            const errorAsAny = loggingError as any;
            assert.strictEqual(errorAsAny.p1, "one");
            assert.strictEqual(errorAsAny.p4, 4);
            assert.deepStrictEqual(errorAsAny.p5, { value: 5, tag: "PackageData" });
        });
        it("Set valid props via 'as any' - returned from getTelemetryProperties, overwrites", () => {
            const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
            loggingError.addTelemetryProperties({p1: "should be overwritten"});
            const errorAsAny = loggingError as any;
            errorAsAny.p1 = "one";
            errorAsAny.p4 = 4;
            errorAsAny.p5 = { value: 5, tag: "PackageData" };
            errorAsAny.pii6 = { value: 5, tag: "UserData" };
            const props = loggingError.getTelemetryProperties();
            assert.strictEqual(props.p1, "one");
            assert.strictEqual(props.p4, 4);
            assert.deepStrictEqual(props.p5, { value: 5, tag: "PackageData" });
            assert.deepStrictEqual(props.pii6, { value: 5, tag: "UserData" });
        });
        it("Set invalid props via 'as any' - excluded from getTelemetryProperties, overwrites", () => {
            const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true});
            const errorAsAny = loggingError as any;
            errorAsAny.p1 = { one: 1 };
            errorAsAny.p4 = null;
            errorAsAny.p5 = ["a", "b", "c"];
            const props = loggingError.getTelemetryProperties();
            assert.strictEqual(props.p1, "REDACTED (arbitrary object)");
            assert.strictEqual(props.p4, "REDACTED (arbitrary object)");
            assert.strictEqual(props.p5, "REDACTED (arbitrary object)");
        });
        it("addTelemetryProperties - overwrites base class Error fields (untagged)", () => {
            const loggingError = new LoggingError("myMessage");
            const overwritingProps = { message: "surprise1", stack: "surprise2", __isFluidLoggingError__: 2 };
            loggingError.addTelemetryProperties(overwritingProps);
            const props = loggingError.getTelemetryProperties();
            assert.deepStrictEqual(props, overwritingProps);
        });
        it("addTelemetryProperties - overwrites base class Error fields (tagged)", () => {
            const overwritingProps = new LoggingError("myMessage");
            const expectedProps = {
                message: { value: "Mark Fields", tag: "UserData" }, // hopefully no one does this!
                stack: { value: "surprise2", tag: "PackageData" },
                __isFluidLoggingError__: 2,
            };
            overwritingProps.addTelemetryProperties(expectedProps);
            const props = overwritingProps.getTelemetryProperties();
            assert.deepStrictEqual(props, expectedProps);
        });
        it("addTelemetryProperties - overwrites existing telemetry props", () => {
            const loggingError = new LoggingError("myMessage", { p1: 1 });
            loggingError.addTelemetryProperties({ p1: "one" });
            assert(loggingError.getTelemetryProperties().p1 === "one");
            loggingError.addTelemetryProperties({ p1: "uno" });
            assert(loggingError.getTelemetryProperties().p1 === "uno");
        });
    });
});
describe("Error Propagation", () => {
    class NamedError extends Error { name = "CoolErrorName"; }
    // These are cases where the input object can be patched to adhere to IFluidErrorBase
    const patchableTestCases: { [label: string]: () => { input: any, expectedOutput: IFluidErrorBase & { stack: "<<from input>>" | "<<generated stack>>"} }} = {
        "Valid Fluid Error": () => ({
            input: {
                errorType: "sometype",
                fluidErrorCode: "somecode",
                message: "Hello",
            },
            expectedOutput: {
                errorType: "sometype",
                fluidErrorCode: "somecode",
                message: "Hello",
                stack: "<<generated stack>>",
            },
        }),
        "Fluid Error minus errorType": () => ({
            input: {
                fluidErrorCode: "somecode",
                message: "Hello",
            },
            expectedOutput: {
                errorType: "none (object)",
                fluidErrorCode: "somecode",
                message: "Hello",
                stack: "<<generated stack>>",
            },
        }),
        "Fluid Error minus fluidErrorCode": () => ({
            input: {
                errorType: "sometype",
                message: "Hello",
            },
            expectedOutput: {
                errorType: "sometype",
                fluidErrorCode: "<none>",
                message: "Hello",
                stack: "<<generated stack>>",
            },
        }),
        "Error object": () => ({
            input: new NamedError("boom"),
            expectedOutput: {
                errorType: "none (CoolErrorName)",
                fluidErrorCode: "<none>",
                message: "boom",
                name: "CoolErrorName",
                stack: "<<from input>>",
            },
        }),
        "LoggingError": () => ({
            input: new LoggingError("boom"),
            expectedOutput: {
                errorType: "none (Error)",
                fluidErrorCode: "<none>",
                message: "boom",
                name: "Error",
                stack: "<<from input>>",
            },
        }),
        "Empty object": () => ({
            input: {},
            expectedOutput: {
                errorType: "none (object)",
                fluidErrorCode: "<none>",
                stack: "<<generated stack>>",
            },
        }),
        "object with stack": () => ({
            input: { message: "whatever", stack: "fake stack goes here" },
            expectedOutput: {
                errorType: "none (object)",
                fluidErrorCode: "<none>",
                message: "whatever",
                stack: "<<from input>>",
            },
        }),
        "object with non-string message and name": () => ({
            input: { message: 4, name: true },
            expectedOutput: {
                errorType: "none (object)",
                fluidErrorCode: "<none>",
                message: "4",
                name: "true",
                stack: "<<generated stack>>",
            },
        }),
    };
    const frozenInputs =
        Object.keys(patchableTestCases).map((key) => {
            const input = patchableTestCases[key]().input;
            Object.freeze(input);
            return { label: key, input };
        });
    const frozenTestCases = frozenInputs.reduce((cases, { label, input }, i) => {
        const { message } = helpers.extractLogSafeErrorProperties(input);
        cases[label] = () => ({
            input,
            expectedOutput: {
                errorType: "none (wrappedFrozenError)",
                fluidErrorCode: "<none>",
                message,
                name: "Error",
            },
        });
        return cases;
    }, {});
    const nonObjectInputs = {
        nullValue: null,
        undef: undefined,
        false: false,
        true: true,
        number: 3.14,
        symbol: Symbol("Unique"),
        function: () => {},
        emptyArray: [],
        array: [1,2,3],
    };
    const nonObjectTestCases = Object.keys(nonObjectInputs).reduce((cases, key, i) => {
        const input = nonObjectInputs[key];
        cases[key] = () => ({
            input,
            expectedOutput: {
                errorType: `none (${typeof input})`,
                fluidErrorCode: "<none>",
                message: String(input),
                name: "Error",
            },
        });
        return cases;
    }, {});
    const annotationCases: Record<string, FluidErrorAnnotations> = {
        none: {},
        justErrorCodeIfNone: { errorCodeIfNone: "foo" },
        justProps: { props: { foo: "bar", one: 1, u: undefined, t: true } },
        all: { props: { foo: "bar", one: 1, u: undefined }, errorCodeIfNone: "foo" },
    };

    let mixinStub: sinon.SinonStub;
    function assertMatching(
        actual: IFluidErrorBase,
        expected: IFluidErrorBase,
        annotations: FluidErrorAnnotations = {},
    ) {
        const expectedErrorCode =
            expected.fluidErrorCode === "<none>"
            ? annotations.errorCodeIfNone === undefined
                ? "none"
                : `none (${annotations.errorCodeIfNone})`
            : expected.fluidErrorCode;
        assert.strictEqual(actual.errorType, expected.errorType, "errorType should match");
        assert.strictEqual(actual.fluidErrorCode, expectedErrorCode, "fluidErrorCode should match");
        assert.strictEqual(actual.message, expected.message, "message should match");
        assert.strictEqual(actual.name, expected.name, "name should match");
        assert.strictEqual(typeof actual.stack, "string", "stack should be present as a string");
        assert.equal(expected.stack === "<<generated stack>>", (actual.stack?.indexOf("<<generated stack>>") ?? -1) >= 0);
        assert(mixinStub.calledWith(actual, { ...annotations.props, errorType: expected.errorType, fluidErrorCode: expectedErrorCode }),
            "mixinTelemetryProps should have been called as expected");
    }
    describe("normalizeError", () => {
        before(() => { mixinStub = sinon.stub(helpers, "mixinTelemetryProps"); });
        afterEach(() => { mixinStub.reset(); });
        after(() => { mixinStub.restore(); });
        function runTests(description: string, testCases: { [label: string]: () => { input: any, expectedOutput: IFluidErrorBase } }, expectPatching: boolean) {
            for (const testCase of Object.keys(testCases)) {
                for (const annotationCase of Object.keys(annotationCases)) {
                    it(`${description}: ${testCase} (${annotationCase})`, () => {
                        // Arrange
                        const { input, expectedOutput } = testCases[testCase]();
                        const annotations = annotationCases[annotationCase];

                        // Act
                        const normalizedOutput = normalizeError(input, annotations);

                        // Assert
                        assertMatching(normalizedOutput, expectedOutput, annotations);
                        assert.equal(normalizedOutput === input, expectPatching, "Didn't match expectation of whether to patch input to yield normalized output");
                    });
                }
            }
        }

        runTests("patchable", patchableTestCases, true /* expectPatching */);
        runTests("frozen", frozenTestCases, false /* expectPatching */);
        runTests("non-object", nonObjectTestCases, false /* expectPatching */);
    });
    describe("annotateErrorObject", () => {
        before(() => { mixinStub = sinon.stub(helpers, "mixinTelemetryProps"); });
        afterEach(() => { mixinStub.reset(); });
        after(() => { mixinStub.restore(); });

        for (const testCase of Object.keys(patchableTestCases)) {
            for (const annotationCase of Object.keys(annotationCases)) {
                it(`${testCase} (${annotationCase})`, () => {
                    // Arrange
                    const { input, expectedOutput } = patchableTestCases[testCase]();
                    const annotations = annotationCases[annotationCase];

                    // Act
                    annotateErrorObject(input, annotations);

                    // Assert
                    assertMatching(input, expectedOutput, annotations);
                });
            }
        }
        for (const testCase of Object.keys(nonObjectTestCases)) {
            it(`${testCase} (non-objects)`, () => {
                const { input } = nonObjectTestCases[testCase]();
                assert.throws(() => { annotateErrorObject(input); }, /Cannot annotate a non-object or frozen error/);
            });
        }
        for (const testCase of Object.keys(frozenTestCases)) {
            it(`${testCase} (frozen)`, () => {
                const { input } = frozenTestCases[testCase]();
                assert.throws(() => { annotateErrorObject(input); }, /Cannot annotate a non-object or frozen error/);
            });
        }
    });
    describe("mixinTelemetryProps", () => {
        const props = annotationCases.justProps.props!;
        for (const testCase of Object.keys(patchableTestCases)) {
            it(`${testCase} (patchable)`, () => {
                // Arrange
                const { input } = patchableTestCases[testCase]();

                // Act
                helpers.mixinTelemetryProps(input, props);

                // Assert
                Object.keys(props).forEach((key) => {
                    assert(input.getTelemetryProperties()[key] === props[key], "props should have been added");
                });

                // Bonus: Confirm that RwLoggingError functions got mixed in (or were already present)
                assert(typeof input.addTelemetryProperties === "function");
                input.addTelemetryProperties({ p2: 2 });
                assert(input.getTelemetryProperties().p2 === 2);
                input.addTelemetryProperties({ p1: "one" });
                assert(input.getTelemetryProperties().p1 === "one", "addTelemetryProperties should overwrite");
            });
        }
        for (const testCase of Object.keys(nonObjectTestCases)) {
            it(`${testCase} (non-objects)`, () => {
                // Arrange
                const { input } = nonObjectTestCases[testCase]();

                // Act / Assert
                assert.throws(() => { helpers.mixinTelemetryProps(input, props); }, /Cannot mixin Telemetry Props/);
            });
        }
        for (const testCase of Object.keys(frozenTestCases)) {
            it(`${testCase} (frozen)`, () => {
                // Arrange
                const { input } = frozenTestCases[testCase]();

                // Act / Assert
                assert.throws(() => { helpers.mixinTelemetryProps(input, props); }, /Cannot mixin Telemetry Props/);
            });
        }
        it("Custom Read/Write Logging Error is annotated", () => {
            // Arrange
            const loggingError = {
                getTelemetryProperties: () => {},
                addTelemetryProperties: () => {},
            };
            const atpSpy = sinon.spy(loggingError, "addTelemetryProperties");

            // Act
            helpers.mixinTelemetryProps(loggingError, { p1: 1 });

            // Assert
            assert(atpSpy.called);
        });
    });
});
