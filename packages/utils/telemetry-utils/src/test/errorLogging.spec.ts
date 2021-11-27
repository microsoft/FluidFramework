/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import sinon from "sinon";
import { v4 as uuid } from "uuid";
import { ITelemetryBaseEvent, ITelemetryProperties } from "@fluidframework/common-definitions";
import { TelemetryDataTag, TelemetryLogger, TaggedLoggerAdapter } from "../logger";
import { LoggingError, isTaggedTelemetryPropertyValue, normalizeError, IFluidErrorAnnotations, wrapError, wrapErrorAndLog } from "../errorLogging";
import { IFluidErrorBase } from "../fluidErrorBase";
import { MockLogger } from "../mockLogger";

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
        it("getTelemetryProperties - tags on overwritten Error base props", () => {
            const event = freshEvent();
            const error = createILoggingError({
                message: { value: "Mark Fields", tag: "UserData" }, // hopefully no one does this!
                stack: { value: "tagged", tag: TelemetryDataTag.PackageData},
            });
            TelemetryLogger.prepareErrorObject(event, error, false);
            assert.deepStrictEqual(event.message, { value: "Mark Fields", tag: "UserData" });
            assert.deepStrictEqual(event.error, "[object Object]"); // weird but ok
            assert.deepStrictEqual(event.stack, { value: "tagged", tag: "PackageData"}); // weird but ok
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
    describe("TaggedLoggerAdapter", () => {
        const events: ITelemetryBaseEvent[] = [];
        class TestTelemetryLogger extends TelemetryLogger {
            public events: ITelemetryBaseEvent[]=[];
            public send(event: ITelemetryBaseEvent): void {
                events.push(this.prepareEvent(event));
            }
        }
        const adaptedLogger = new TaggedLoggerAdapter(new TestTelemetryLogger("namespace"));

        it("TaggedLoggerAdapter - tagged UserData is removed", () => {
            const event = {
                category: "cat",
                eventName: "event",
                userDataObject: {
                    tag: TelemetryDataTag.UserData,
                    value: "someUserData",
                },
            };
            adaptedLogger.send(event);
            assert.strictEqual(events[0].userDataObject, "REDACTED (UserData)", "someUserData should be redacted");
            events.pop();
        });
        it("TaggedLoggerAdapter - tagged PackageData are preserved", () => {
            const event = {
                category: "cat",
                eventName: "event",
                packageDataObject: {
                    tag: TelemetryDataTag.PackageData,
                    value: "somePackageData",
                },
            };
            adaptedLogger.send(event);
            assert.strictEqual(events[0].packageDataObject, "somePackageData", "somePackageData should be preserved");
            events.pop();
        });
        it("TaggedLoggerAdapter - tagged [unrecognized tag] are removed", () => {
            const event = {
                category: "cat",
                eventName: "event",
                unknownTaggedObject: {
                    tag: "someUnknownTag",
                    value: "someEvilData",
                },
            };
            adaptedLogger.send(event);
            assert.strictEqual(events[0].unknownTaggedObject, "REDACTED (unknown tag)", "someUnknownTag should be redacted");
            events.pop();
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
        it("errorInstanceId unique each time", () => {
            const e1 = new LoggingError("1");
            const e2 = new LoggingError("2");
            assert.equal(e1.errorInstanceId.length, 36, "should be guid-length");
            assert.equal(e2.errorInstanceId.length, 36, "should be guid-length");
            assert.notEqual(e1.errorInstanceId, e2.errorInstanceId, "each error instance should get unique id");
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
            (loggingError as any).p1 = "should not be overwritten";
            loggingError.addTelemetryProperties(
                {p1: "ignored", p4: 4, p5: { value: 5, tag: "PackageData" }});
            const props = loggingError.getTelemetryProperties();
            assert.strictEqual(props.p1, "should not be overwritten");
            assert.strictEqual(props.p4, 4);
            assert.deepStrictEqual(props.p5, { value: 5, tag: "PackageData" });
            const errorAsAny = loggingError as any;
            assert.strictEqual(errorAsAny.p1, "should not be overwritten");
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
        it("addTelemetryProperties - Does not overwrite base class Error fields (untagged)", () => {
            const loggingError = new LoggingError("myMessage");
            const propsWillBeIgnored = { message: "surprise1", stack: "surprise2" };
            loggingError.addTelemetryProperties(propsWillBeIgnored);
            const props = loggingError.getTelemetryProperties();
            const { message, stack, errorInstanceId } = loggingError;
            assert.deepStrictEqual(props, { message, stack, errorInstanceId }, "addTelemetryProperties should not overwrite existing props");
        });
        it("addTelemetryProperties - Does not overwrite base class Error fields (tagged)", () => {
            const loggingError = new LoggingError("myMessage");
            const propsWillBeIgnored = {
                message: { value: "Mark Fields", tag: "UserData" },
                stack: { value: "surprise2", tag: "PackageData" },
            };
            loggingError.addTelemetryProperties(propsWillBeIgnored);
            const props = loggingError.getTelemetryProperties();
            const { message, stack, errorInstanceId } = loggingError;
            assert.deepStrictEqual(props, { message, stack, errorInstanceId }, "addTelemetryProperties should not overwrite existing props");
        });
        it("addTelemetryProperties - Does not overwrite existing telemetry props", () => {
            const loggingError = new LoggingError("myMessage", { p1: 1 });
            loggingError.addTelemetryProperties({ p1: "one" });
            assert(loggingError.getTelemetryProperties().p1 === 1);
            loggingError.addTelemetryProperties({ p1: "uno" });
            assert(loggingError.getTelemetryProperties().p1 === 1);
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
    readonly name: string = "Error";
    readonly errorInstanceId: string;

    constructor(errorProps: Omit<IFluidErrorBase, "getTelemetryProperties" | "addTelemetryProperties" | "errorInstanceId" | "name">) {
        this.errorType = errorProps.errorType;
        this.fluidErrorCode = errorProps.fluidErrorCode;
        this.message = errorProps.message;
        this.stack = errorProps.stack;
        this.errorInstanceId = uuid();

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
    justProps: { props: { foo: "bar", one: 1, u: undefined, t: true } },
};

describe("normalizeError", () => {
    describe("Valid Errors (Legacy and Current)", () => {
        for (const annotationCase of Object.keys(annotationCases)) {
            const annotations = annotationCases[annotationCase];
            it(`Valid legacy error - Patch and return (annotations: ${annotationCase})`, () => {
                // Arrange
                const errorProps =
                    {errorType: "et1", message: "m1", fluidErrorCode: "toBeRemoved" };
                const legacyError = new TestFluidError(errorProps).withoutProperty("fluidErrorCode");

                // Act
                const normalizedError = normalizeError(legacyError, annotations);

                // Assert
                assert.equal(normalizedError, legacyError, "normalize should yield the same error as passed in");
                assert.equal(normalizedError.errorType, "et1", "errorType should be unchanged");
                assert.equal(normalizedError.fluidErrorCode, "<error predates fluidErrorCode>", "errorCode should be patched properly");
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
            const errorProps =
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
        });
        const typicalOutput = (message: string, stackHint: "<<natural stack>>" | "<<stack from input>>") => new TestFluidError({
            errorType: "genericError",
            fluidErrorCode: "",
            message,
            stack: stackHint,
        }).withExpectedTelemetryProps({ untrustedOrigin: 1 });
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
                expectedOutput: typicalOutput("Hello", "<<natural stack>>"),
            }),
            "Fluid Error minus message (no stack)": () => ({
                input: sampleFluidError().withoutProperty("message").withoutProperty("stack"),
                expectedOutput: typicalOutput("[object Object]", "<<natural stack>>"),
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
                expectedOutput: typicalOutput("[object Object]", "<<natural stack>>"),
            }),
            "object with stack": () => ({
                input: { message: "whatever", stack: "fake stack goes here" },
                expectedOutput: typicalOutput("whatever", "<<stack from input>>"),
            }),
            "object with non-string message and name": () => ({
                input: { message: 42, name: true },
                expectedOutput: typicalOutput("[object Object]", "<<natural stack>>"),
            }),
            "nullValue": () => ({
                input: null,
                expectedOutput: typicalOutput("null", "<<natural stack>>"),
            }),
            "undef": () => ({
                input: undefined,
                expectedOutput: typicalOutput("undefined", "<<natural stack>>").withExpectedTelemetryProps({ typeofError: "undefined" }),
            }),
            "false": () => ({
                input: false,
                expectedOutput: typicalOutput("false", "<<natural stack>>").withExpectedTelemetryProps({ typeofError: "boolean" }),
            }),
            "true": () => ({
                input: true,
                expectedOutput: typicalOutput("true", "<<natural stack>>").withExpectedTelemetryProps({ typeofError: "boolean" }),
            }),
            "number": () => ({
                input: 3.14,
                expectedOutput: typicalOutput("3.14", "<<natural stack>>").withExpectedTelemetryProps({ typeofError: "number" }),
            }),
            "symbol": () => ({
                input: Symbol("Unique"),
                expectedOutput: typicalOutput("Symbol(Unique)", "<<natural stack>>").withExpectedTelemetryProps({ typeofError: "symbol" }),
            }),
            "function": () => ({
                input: () => {},
                expectedOutput: typicalOutput("() => { }", "<<natural stack>>").withExpectedTelemetryProps({ typeofError: "function" }),
            }),
            "emptyArray": () => ({
                input: [],
                expectedOutput: typicalOutput("", "<<natural stack>>"),
            }),
            "array": () => ({
                input: [1,2,3],
                expectedOutput: typicalOutput("1,2,3", "<<natural stack>>"),
            }),
        };
        function assertMatching(
            actual: IFluidErrorBase,
            expected: TestFluidError,
            annotations: IFluidErrorAnnotations = {},
            inputStack: string,
        ) {
            expected.withExpectedTelemetryProps({
                ...annotations.props,
                fluidErrorCode: expected.fluidErrorCode,
                errorInstanceId: actual.errorInstanceId,
            });

            assert.equal(actual.errorType, expected.errorType, "errorType should match");
            assert.equal(actual.fluidErrorCode, expected.fluidErrorCode, "fluidErrorCode should match");
            assert.equal(actual.message, expected.message, "message should match");
            assert.equal(actual.name, expected.name, "name should match");

            assert.equal(actual.errorInstanceId.length, 36, "should be guid-length");

            const actualStack = actual.stack;
            assert(actualStack !== undefined, "stack should be present as a string");
            if (actualStack.indexOf("at Object.normalizeError") >= 0) { // This indicates the stack was populated naturally by new SimpleFluidError
                assert.equal(expected.stack, "<<natural stack>>", "<<natural stack>> hint should be used if not overwritten");
                expected.withExpectedTelemetryProps({ stack: actualStack });
            } else {
                assert.equal(actualStack, inputStack, "If stack wasn't generated, it should match input stack");
                assert.equal(expected.stack, "<<stack from input>>", "<<stack from input>> hint should be used if using stack from input error object");
                expected.withExpectedTelemetryProps({ stack: inputStack });
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

describe("wrapError", () => {
    it("Copy message and stack", () => {
        const innerError = new LoggingError("hello");
        innerError.stack = "extra special stack";
        const newError = wrapError(innerError, (message) => (new LoggingError(message)) as LoggingError & { fluidErrorCode: "fluidErrorCode", errorType: "genericError" });
        assert.equal(newError.message, innerError.message, "messages should match");
        assert.equal(newError.stack, innerError.stack, "stacks should match");
    });
    it("Include innerErrorInstanceId in telemetry props", () => {
        const innerError = new LoggingError("hello");
        const newError = wrapError(innerError, (message) => (new LoggingError(message)) as LoggingError & { fluidErrorCode: "fluidErrorCode", errorType: "genericError" });
        assert(newError.getTelemetryProperties().innerErrorInstanceId === innerError.errorInstanceId);
    });
});
describe("wrapErrorAndLog", () => {
    const mockLogger = new MockLogger();
    const innerError = new LoggingError("hello");
    const newError = wrapErrorAndLog(innerError, (message) => (new LoggingError(message)) as LoggingError & { fluidErrorCode: "fluidErrorCode", errorType: "genericError" }, mockLogger);
    assert(mockLogger.matchEvents([{
        eventName: "WrapError",
        wrappedByErrorInstanceId: newError.errorInstanceId,
        error: "hello",
     }]), "Expected the 'WrapError' event to be logged");
});
