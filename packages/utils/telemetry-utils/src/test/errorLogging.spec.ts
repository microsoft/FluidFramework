/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import sinon from "sinon";
import { ITelemetryBaseEvent, ITelemetryProperties } from "@fluidframework/common-definitions";
import { TelemetryDataTag, TelemetryLogger } from "../logger";
import { LoggingError, isTaggedTelemetryPropertyValue, normalizeError, IFluidErrorAnnotations } from "../errorLogging";
import { IFluidErrorBase } from "../fluidErrorBase";

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
        it("getTelemetryProperties respects omitPropsFromLogging", () => {
            const loggingError = new LoggingError("myMessage", {}, new Set(["foo"]));
            (loggingError as any).foo = "secrets!";
            (loggingError as any).bar = "normal";
            const props = loggingError.getTelemetryProperties();
            assert.strictEqual(props.omitPropsFromLogging, undefined, "omitPropsFromLogging itself should be omitted");
            assert.strictEqual(props.foo, undefined, "foo should have been omitted");
            assert.strictEqual(props.bar, "normal", "bar should not be omitted");
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
            const overwritingProps = { message: "surprise1", stack: "surprise2" };
            loggingError.addTelemetryProperties(overwritingProps);
            const props = loggingError.getTelemetryProperties();
            assert.deepStrictEqual(props, overwritingProps);
        });
        it("addTelemetryProperties - overwrites base class Error fields (tagged)", () => {
            const overwritingProps = new LoggingError("myMessage");
            const expectedProps = {
                message: { value: "Mark Fields", tag: "UserData" }, // hopefully no one does this!
                stack: { value: "surprise2", tag: "PackageData" },
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

class TestFluidError implements IFluidErrorBase {
    readonly atpStub: sinon.SinonStub;
    expectedTelemetryProps: ITelemetryProperties;

    readonly errorType: string;
    readonly fluidErrorCode: string;
    readonly message: string;
    readonly stack?: string;
    readonly name?: string;

    constructor(errorProps: Omit<IFluidErrorBase, "getTelemetryProperties" | "addTelemetryProperties">) {
        this.errorType = errorProps.errorType;
        this.fluidErrorCode = errorProps.fluidErrorCode;
        this.message = errorProps.message;
        this.stack = errorProps.stack;
        this.name = errorProps.name;

        this.atpStub = sinon.stub(this, "addTelemetryProperties");
        this.expectedTelemetryProps = { ...errorProps };
    }

    getTelemetryProperties(): ITelemetryProperties {
        throw new Error("Not Implemented");
    }

    addTelemetryProperties(props: ITelemetryProperties) {
        throw new Error("Not Implemented");
    }

    withoutProperty(propName: keyof IFluidErrorBase) {
        const objectWithoutProp = {};
        objectWithoutProp[propName] = undefined;
        Object.assign(this, objectWithoutProp);
        return this;
    }

    withExpectedTelemetryProps(props: ITelemetryProperties) {
        Object.assign(this.expectedTelemetryProps, props);
        return this;
    }
}

const annotationCases: Record<string, IFluidErrorAnnotations> = {
    noAnnotations: {},
    justErrorCodeIfNone: { errorCodeIfNone: "foo" },
    justProps: { props: { foo: "bar", one: 1, u: undefined, t: true } },
    allAnnotations: { props: { foo: "bar", one: 1, u: undefined }, errorCodeIfNone: "foo" },
};

describe("normalizeError", () => {
    describe("Valid Errors (Legacy and Current)", () => {
        for (const annotationCase of Object.keys(annotationCases)) {
            const annotations = annotationCases[annotationCase];
            it(`Valid legacy error - Patch and return (annotations: ${annotationCase})`, () => {
                // Arrange
                const errorProps: Omit<IFluidErrorBase, "getTelemetryProperties" | "addTelemetryProperties"> =
                    {errorType: "et1", message: "m1", fluidErrorCode: "toBeRemoved" };
                const legacyError = new TestFluidError(errorProps).withoutProperty("fluidErrorCode");
                const expectedErrorCode = annotations.errorCodeIfNone === undefined
                    ? "<error predates fluidErrorCode>"
                    : annotations.errorCodeIfNone;

                // Act
                const normalizedError = normalizeError(legacyError, annotations);

                // Assert
                assert.equal(normalizedError, legacyError, "normalize should yield the same error as passed in");
                assert.equal(normalizedError.errorType, "et1", "errorType should be unchanged");
                assert.equal(normalizedError.fluidErrorCode, expectedErrorCode, "errorCode should be patched properly");
                assert.equal(normalizedError.message, "m1", "message should be unchanged");
                if (annotations.props !== undefined) {
                    assert(legacyError.atpStub.calledWith(annotations.props), "addTelemetryProperties should have been called");
                }
            });
            it(`Valid Fluid Error - untouched (annotations: ${annotationCase})`, () => {
                // Arrange
                const fluidError = new TestFluidError({errorType: "et1", fluidErrorCode: "ec1", message: "m1" });
                // We don't expect legacyError to be modified itself at all
                Object.freeze(fluidError);

                // Act
                const normalizedError = normalizeError(fluidError, annotations);

                // Assert
                assert(normalizedError === fluidError);
                if (annotations.props !== undefined) {
                    assert(fluidError.atpStub.calledWith(annotations.props), "addTelemetryProperties should have been called");
                }
            });
        }
        it("Valid Fluid Error - stack not added if missing", () => {
            // Arrange
            const fluidError = new TestFluidError({errorType: "et1", fluidErrorCode: "ec1", message: "m1" }).withoutProperty("stack");
            // We don't expect legacyError to be modified itself at all
            Object.freeze(fluidError);

            // Act
            const normalizedError = normalizeError(fluidError, {});

            // Assert
            assert(normalizedError === fluidError);
            assert(normalizedError.stack === undefined);
        });
        it("Frozen legacy error - Throws", () => {
            // Arrange
            const errorProps: Omit<IFluidErrorBase, "getTelemetryProperties" | "addTelemetryProperties"> =
                {errorType: "et1", message: "m1", fluidErrorCode: "toBeRemoved" };
            const legacyError = new TestFluidError(errorProps).withoutProperty("fluidErrorCode");
            Object.freeze(legacyError);

            // Act/Assert
            assert.throws(() => normalizeError(legacyError, {}), /Cannot assign to read only property/);
        });
    });
    describe("Errors Needing Normalization", () => {
        class NamedError extends Error { name = "CoolErrorName"; }
        const sampleFluidError = () => new TestFluidError({
            errorType: "someType",
            fluidErrorCode: "someCode",
            message: "Hello",
            stack: "cool stack trace",
            name: "someName!!!",
        });
        const typicalOutput = (message: string, stackHint: "<<generated stack>>" | "<<stack from input>>") => new TestFluidError({
            errorType: "genericError",
            fluidErrorCode: "<none>",
            message,
            stack: stackHint,
        }).withExpectedTelemetryProps({ untrustedOrigin: true });
        const untrustedInputs: { [label: string]: () => { input: any, expectedOutput: TestFluidError }} = {
            "Fluid Error minus errorType": () => ({
                input: sampleFluidError().withoutProperty("errorType"),
                expectedOutput: typicalOutput("Hello", "<<stack from input>>"),
            }),
//          "Fluid Error minus fluidErrorCode": This is a Valid Legacy Error, tested elsewhere in this file
            "Fluid Error minus message": () => ({
                input: sampleFluidError().withoutProperty("message"),
                expectedOutput: typicalOutput("[object Object]", "<<stack from input>>"),
            }),
            "Fluid Error minus getTelemetryProperties": () => ({
                input: sampleFluidError().withoutProperty("getTelemetryProperties"),
                expectedOutput: typicalOutput("Hello", "<<stack from input>>"),
            }),
            "Fluid Error minus addTelemetryProperties": () => ({
                input: sampleFluidError().withoutProperty("addTelemetryProperties"),
                expectedOutput: typicalOutput("Hello", "<<stack from input>>"),
            }),
            "Fluid Error minus errorType (no stack)": () => ({
                input: sampleFluidError().withoutProperty("errorType").withoutProperty("stack"),
                expectedOutput: typicalOutput("Hello", "<<generated stack>>"),
            }),
            "Fluid Error minus message (no stack)": () => ({
                input: sampleFluidError().withoutProperty("message").withoutProperty("stack"),
                expectedOutput: typicalOutput("[object Object]", "<<generated stack>>"),
            }),
            "Error object": () => ({
                input: new NamedError("boom"),
                expectedOutput: typicalOutput("boom", "<<stack from input>>"),
            }),
            "LoggingError": () => ({
                input: new LoggingError("boom"),
                expectedOutput: typicalOutput("boom", "<<stack from input>>"),
            }),
            "Empty object": () => ({
                input: {},
                expectedOutput: typicalOutput("[object Object]", "<<generated stack>>"),
            }),
            "object with stack": () => ({
                input: { message: "whatever", stack: "fake stack goes here" },
                expectedOutput: typicalOutput("whatever", "<<stack from input>>"),
            }),
            "object with non-string message and name": () => ({
                input: { message: 42, name: true },
                expectedOutput: typicalOutput("[object Object]", "<<generated stack>>"),
            }),
            "nullValue": () => ({
                input: null,
                expectedOutput: typicalOutput("null", "<<generated stack>>"),
            }),
            "undef": () => ({
                input: undefined,
                expectedOutput: typicalOutput("undefined", "<<generated stack>>").withExpectedTelemetryProps({ typeofError: "undefined" }),
            }),
            "false": () => ({
                input: false,
                expectedOutput: typicalOutput("false", "<<generated stack>>").withExpectedTelemetryProps({ typeofError: "boolean" }),
            }),
            "true": () => ({
                input: true,
                expectedOutput: typicalOutput("true", "<<generated stack>>").withExpectedTelemetryProps({ typeofError: "boolean" }),
            }),
            "number": () => ({
                input: 3.14,
                expectedOutput: typicalOutput("3.14", "<<generated stack>>").withExpectedTelemetryProps({ typeofError: "number" }),
            }),
            "symbol": () => ({
                input: Symbol("Unique"),
                expectedOutput: typicalOutput("Symbol(Unique)", "<<generated stack>>").withExpectedTelemetryProps({ typeofError: "symbol" }),
            }),
            "function": () => ({
                input: () => {},
                expectedOutput: typicalOutput("() => { }", "<<generated stack>>").withExpectedTelemetryProps({ typeofError: "function" }),
            }),
            "emptyArray": () => ({
                input: [],
                expectedOutput: typicalOutput("", "<<generated stack>>"),
            }),
            "array": () => ({
                input: [1,2,3],
                expectedOutput: typicalOutput("1,2,3", "<<generated stack>>"),
            }),
        };
        function assertMatching(
            actual: IFluidErrorBase,
            expected: TestFluidError,
            annotations: IFluidErrorAnnotations = {},
            inputStack: string,
        ) {
            const expectedErrorCode =
                expected.fluidErrorCode === "<none>"
                    ? annotations.errorCodeIfNone === undefined
                        ? "none"
                        : annotations.errorCodeIfNone
                    : expected.fluidErrorCode;
            expected.withExpectedTelemetryProps({ ...annotations.props, fluidErrorCode: expectedErrorCode });

            assert.strictEqual(actual.errorType, expected.errorType, "errorType should match");
            assert.strictEqual(actual.fluidErrorCode, expectedErrorCode, "fluidErrorCode should match");
            assert.strictEqual(actual.message, expected.message, "message should match");
            assert.strictEqual(actual.name, expected.name, "name should match");

            const actualStack = actual.stack;
            assert(actualStack !== undefined, "stack should be present as a string");
            if (actualStack.indexOf("<<generated stack>>") >= 0) {
                assert.equal(expected.stack, "<<generated stack>>", "<<generated stack>> hint should be used if generated");
                Object.assign(actual, { stack: "<<generated stack>>" }); // for telemetry props to match below
            } else {
                assert.equal(actualStack, inputStack, "If stack wasn't generated, it should match input stack");
                assert.equal(expected.stack, "<<stack from input>>", "<<stack from input>> hint should be used if not generated");
                Object.assign(actual, { stack: "<<stack from input>>" }); // for telemetry props to match below
            }

            assert.deepStrictEqual(actual.getTelemetryProperties(), expected.expectedTelemetryProps, "telemetry props should match");
        }
        for (const annotationCase of Object.keys(annotationCases)) {
            const annotations = annotationCases[annotationCase];
            for (const caseName of Object.keys(untrustedInputs)) {
                const getTestCase = untrustedInputs[caseName];
                it(`Normalize untrusted error: ${caseName} (${annotationCase})`, () => {
                    // Arrange
                    const { input, expectedOutput } = getTestCase();

                    // Act
                    const normalized = normalizeError(input, annotations);

                    // Assert
                    assert.notEqual(input, normalized, "input should have yielded a new error object");
                    assertMatching(normalized, expectedOutput, annotations, input?.stack);

                    // Bonus
                    normalized.addTelemetryProperties({foo: "bar"});
                    assert.equal(normalized.getTelemetryProperties().foo, "bar", "can add telemetry props after normalization");
                });
            }
        }
    });
});
