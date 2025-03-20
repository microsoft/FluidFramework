/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unicorn/no-null */

import { strict as assert } from "node:assert";

import type {
	ITelemetryBaseEvent,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import sinon from "sinon";
import { v4 as uuid } from "uuid";

import {
	type IFluidErrorAnnotations,
	LoggingError,
	extractLogSafeErrorProperties,
	isExternalError,
	isTaggedTelemetryPropertyValue,
	normalizeError,
	wrapError,
	wrapErrorAndLog,
	generateStack,
} from "../errorLogging.js";
import { type IFluidErrorBase, isFluidError } from "../fluidErrorBase.js";
import { TaggedLoggerAdapter, TelemetryDataTag, TelemetryLogger } from "../logger.js";
import { MockLogger } from "../mockLogger.js";
import type { ITelemetryPropertiesExt } from "../telemetryTypes.js";

describe("Error Logging", () => {
	describe("TelemetryLogger.prepareErrorObject", () => {
		function freshEvent(): ITelemetryBaseEvent {
			return { category: "cat1", eventName: "event1" };
		}
		function createILoggingError(props: ITelemetryBaseProperties): {
			getTelemetryProperties: () => ITelemetryBaseProperties;
		} {
			return { ...props, getTelemetryProperties: (): ITelemetryBaseProperties => props };
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

			// Technically this violates TelemetryBaseEventPropertyType's type constraint but it's actually supported
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
				stack: { value: "tagged", tag: TelemetryDataTag.CodeArtifact },
			});
			TelemetryLogger.prepareErrorObject(event, error, false);
			assert.deepStrictEqual(event.message, { value: "Mark Fields", tag: "UserData" });
			assert.deepStrictEqual(event.error, "[object Object]"); // weird but ok
			assert.deepStrictEqual(event.stack, {
				value: "tagged",
				tag: TelemetryDataTag.CodeArtifact,
			});
		});
		it("getTelemetryProperties absent - no further props added", () => {
			const event = freshEvent();
			const error = { ...new Error("boom"), foo: "foo", bar: 2 };
			TelemetryLogger.prepareErrorObject(event, error, false);
			assert(event.foo === undefined && event.bar === undefined);
		});
		it("getTelemetryProperties overlaps event - do not overwrite", () => {
			const event = { ...freshEvent(), foo: "event_foo", bar: 42 };
			const error = createILoggingError({ foo: "error_foo", bar: -1 });
			TelemetryLogger.prepareErrorObject(event, error, false);
			assert(event.foo === "event_foo" && event.bar === 42);
		});
		it("getTelemetryProperties present - add additional props", () => {
			const event = freshEvent();
			const error = createILoggingError({ foo: "foo", bar: 2 });
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
			assert.strictEqual(typeof event.stack, "string");
			assert(!(event.stack as string).includes("MyName"));
		});
	});
	describe("TaggedLoggerAdapter", () => {
		const events: ITelemetryBaseEvent[] = [];
		class TestTelemetryLogger extends TelemetryLogger {
			public events: ITelemetryBaseEvent[] = [];
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
			assert.strictEqual(
				events[0].userDataObject,
				"REDACTED (UserData)",
				"someUserData should be redacted",
			);
			events.pop();
		});
		it("TaggedLoggerAdapter - tagged CodeArtifact are preserved", () => {
			const event = {
				category: "cat",
				eventName: "event",
				packageDataObject: {
					tag: TelemetryDataTag.CodeArtifact,
					value: "somePackageData",
				},
			};
			adaptedLogger.send(event);
			assert.strictEqual(
				events[0].packageDataObject,
				"somePackageData",
				"somePackageData should be preserved",
			);
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
			assert.strictEqual(
				events[0].unknownTaggedObject,
				"REDACTED (unknown tag)",
				"someUnknownTag should be redacted",
			);
			events.pop();
		});
	});
	describe("TaggedTelemetryData", () => {
		it("Ensure backwards compatibility", () => {
			// The values of the enum should never change (even if the keys are renamed)
			assert(TelemetryDataTag.CodeArtifact === ("CodeArtifact" as TelemetryDataTag));
			assert(TelemetryDataTag.UserData === ("UserData" as TelemetryDataTag));
		});
	});
	describe("isTaggedTelemetryPropertyValue", () => {
		it("non-object input not ok", () => {
			assert.strictEqual(isTaggedTelemetryPropertyValue("hello"), false);
			assert.strictEqual(isTaggedTelemetryPropertyValue(123), false);
			assert.strictEqual(isTaggedTelemetryPropertyValue(false), false);
			assert.strictEqual(isTaggedTelemetryPropertyValue(undefined), false);
			assert.strictEqual(isTaggedTelemetryPropertyValue(null as any), false);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue(function x() {
					return 54;
				} as any),
				false,
			);
			assert.strictEqual(isTaggedTelemetryPropertyValue(Symbol("okay") as any), false);
		});
		it("non-object value ok", () => {
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: "hello", tag: "any string" }),
				true,
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: 123, tag: "any string" }),
				true,
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: false, tag: "any string" }),
				true,
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: undefined, tag: "any string" }),
				true,
			);
		});
		it("Check result for various invalid inputs (per typings)", () => {
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ tag: "any string" } as any),
				true,
				"value prop may be absent",
			);
			// The type guard used is a bit imprecise. Here is proof (these "shouldn't" be ok)
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({
					value: function x() {
						return 54;
					} as any,
					tag: "any string",
				}),
				true,
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: Symbol("okay") as any, tag: "any string" }),
				true,
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: "hello", tag: 1 } as any),
				false,
				"number tag is bad",
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: "hello", tag: false } as any),
				false,
				"boolean tag is bad",
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: "hello", tag: {} } as any),
				false,
				"object tag is bad",
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: "hello", tag: null } as any),
				false,
				"null tag is bad",
			);
			assert.strictEqual(
				isTaggedTelemetryPropertyValue({ value: "hello" } as any),
				false,
				"undefined (missing) tag is bad",
			);
		});
	});
	describe("LoggingError", () => {
		it("ctor props are assigned to the object", () => {
			const loggingError = new LoggingError("myMessage", {
				p1: 1,
				p2: "two",
				p3: true,
				tagged: { value: 4, tag: "CodeArtifact" },
			});
			const errorAsAny = loggingError as any;
			assert.strictEqual(errorAsAny.message, "myMessage");
			assert.strictEqual(errorAsAny.p1, 1);
			assert.strictEqual(errorAsAny.p2, "two");
			assert.strictEqual(errorAsAny.p3, true);
			assert.deepStrictEqual(errorAsAny.tagged, { value: 4, tag: "CodeArtifact" });
		});
		it("errorInstanceId unique each time", () => {
			const e1 = new LoggingError("1");
			const e2 = new LoggingError("2");
			assert.equal(e1.errorInstanceId.length, 36, "should be guid-length");
			assert.equal(e2.errorInstanceId.length, 36, "should be guid-length");
			assert.notEqual(
				e1.errorInstanceId,
				e2.errorInstanceId,
				"each error instance should get unique id",
			);
		});
		it("getTelemetryProperties extracts all untagged ctor props", () => {
			const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true });
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
			assert.strictEqual(
				props.omitPropsFromLogging,
				undefined,
				"omitPropsFromLogging itself should be omitted",
			);
			assert.strictEqual(props.foo, undefined, "foo should have been omitted");
			assert.strictEqual(props.bar, "normal", "bar should not be omitted");
		});
		it("addTelemetryProperties - adds to object, returned from getTelemetryProperties, doesn't overwrite", () => {
			const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true });
			(loggingError as any).p1 = "should not be overwritten";
			loggingError.addTelemetryProperties({
				p1: "ignored",
				p4: 4,
				p5: true,
				p6: { value: 5, tag: "CodeArtifact" },
				p7: ["a", "b", "c"],
				p8: [1, 2, 3],
				p9: [true, true, false],
				p10: { one: "1" },
				p11: undefined,
				p12: { value: ["1", 2, true], tag: "CodeArtifact" },
			});
			const props = loggingError.getTelemetryProperties();
			assert.strictEqual(props.p1, "should not be overwritten");
			assert.strictEqual(props.p4, 4);
			assert.strictEqual(props.p5, true);
			assert.deepStrictEqual(props.p6, { value: 5, tag: "CodeArtifact" });
			assert.strictEqual(props.p7, '["a","b","c"]');
			assert.strictEqual(props.p8, "[1,2,3]");
			assert.strictEqual(props.p9, "[true,true,false]");
			assert.strictEqual(props.p10, `{"one":"1"}`);
			assert.strictEqual(props.p11, undefined);
			assert.deepStrictEqual(props.p12, { value: `["1",2,true]`, tag: "CodeArtifact" });
			const errorAsAny = loggingError as any;
			assert.strictEqual(errorAsAny.p1, "should not be overwritten");
			assert.strictEqual(errorAsAny.p4, 4);
			assert.strictEqual(errorAsAny.p5, true);
			assert.deepStrictEqual(errorAsAny.p6, { value: 5, tag: "CodeArtifact" });
			assert.deepStrictEqual(errorAsAny.p7, ["a", "b", "c"]);
			assert.deepStrictEqual(errorAsAny.p8, [1, 2, 3]);
			assert.deepStrictEqual(errorAsAny.p9, [true, true, false]);
			assert.deepStrictEqual(errorAsAny.p10, { one: "1" });
			assert.strictEqual(errorAsAny.p11, undefined);
			assert.deepStrictEqual(errorAsAny.p12, { value: ["1", 2, true], tag: "CodeArtifact" });
		});
		it("Set valid props via 'as any' - returned from getTelemetryProperties, overwrites", () => {
			const loggingError = new LoggingError("myMessage", { p1: 1, p2: "two", p3: true });
			loggingError.addTelemetryProperties({ p1: "should be overwritten" });
			const errorAsAny = loggingError as any;
			// Things that could be set with addTelemetryProperties
			errorAsAny.p1 = "one";
			errorAsAny.p4 = 4;
			errorAsAny.p5 = true;
			errorAsAny.p6 = { value: 5, tag: "CodeArtifact" };
			errorAsAny.userData6 = { value: 5, tag: "UserData" };
			errorAsAny.p7 = ["a", "b", "c"];
			errorAsAny.p8 = [1, 2, 3];
			errorAsAny.p9 = [true, true, false];
			errorAsAny.p10 = { one: "1" };
			errorAsAny.p11 = undefined;
			errorAsAny.p12 = { value: ["1", 2, true], tag: "CodeArtifact" };
			// Things that can't be set with addTelemetryProperties
			errorAsAny.p13 = null; // Null
			errorAsAny.p14 = ["a", "b", "c", null]; // Array with nulls
			errorAsAny.p15 = [[1, 2]]; // Nested array
			const props = loggingError.getTelemetryProperties();
			assert.strictEqual(props.p1, "one");
			assert.strictEqual(props.p4, 4);
			assert.strictEqual(props.p5, true);
			assert.deepStrictEqual(props.p6, { value: 5, tag: "CodeArtifact" });
			assert.deepStrictEqual(props.userData6, { value: 5, tag: "UserData" });
			assert.strictEqual(props.p7, `["a","b","c"]`);
			assert.strictEqual(props.p8, `[1,2,3]`);
			assert.strictEqual(props.p9, `[true,true,false]`);
			assert.strictEqual(props.p10, `{"one":"1"}`);
			assert.strictEqual(props.p11, undefined);
			assert.deepStrictEqual(props.p12, { value: `["1",2,true]`, tag: "CodeArtifact" });
			assert.strictEqual(props.p13, "null");
			assert.strictEqual(props.p14, `["a","b","c",null]`);
			assert.strictEqual(props.p15, "[[1,2]]");
		});
		it("addTelemetryProperties - Does not overwrite base class Error fields (untagged)", () => {
			const loggingError = new LoggingError("myMessage");
			const propsWillBeIgnored = { message: "surprise1", stack: "surprise2" };
			loggingError.addTelemetryProperties(propsWillBeIgnored);
			const props = loggingError.getTelemetryProperties();
			const { message, stack, errorInstanceId } = loggingError;
			assert.deepStrictEqual(
				props,
				{ message, stack, errorInstanceId },
				"addTelemetryProperties should not overwrite existing props",
			);
		});
		it("addTelemetryProperties - Does not overwrite base class Error fields (tagged)", () => {
			const loggingError = new LoggingError("myMessage");
			const propsWillBeIgnored = {
				message: { value: "Mark Fields", tag: "UserData" },
				stack: { value: "surprise2", tag: "CodeArtifact" },
			};
			loggingError.addTelemetryProperties(propsWillBeIgnored);
			const props = loggingError.getTelemetryProperties();
			const { message, stack, errorInstanceId } = loggingError;
			assert.deepStrictEqual(
				props,
				{ message, stack, errorInstanceId },
				"addTelemetryProperties should not overwrite existing props",
			);
		});
		it("addTelemetryProperties - Does not overwrite existing telemetry props", () => {
			const loggingError = new LoggingError("myMessage", { p1: 1 });
			loggingError.addTelemetryProperties({ p1: "one" });
			assert(loggingError.getTelemetryProperties().p1 === 1);
			loggingError.addTelemetryProperties({ p1: "uno" });
			assert(loggingError.getTelemetryProperties().p1 === 1);
		});
		it("typeCheck - Correctly type checks an instace of LoggingError", () => {
			const loggingError = new LoggingError("myMessage", { p1: 1 });
			const normalizedLoggingError = normalizeError(loggingError);
			const basicError = new Error("basicErrorMessage");
			assert.strictEqual(
				LoggingError.typeCheck(loggingError),
				true,
				"LoggingError is a LoggingError",
			);
			assert.strictEqual(
				LoggingError.typeCheck(normalizedLoggingError),
				true,
				"Normalized Error is a LoggingError",
			);
			assert.strictEqual(
				LoggingError.typeCheck(basicError),
				false,
				"Error is not a LoggingError",
			);
		});
	});
	describe("extractLogSafeErrorProperties", () => {
		function createSampleError(): Error {
			try {
				const error = new Error("asdf");
				error.name = "FooError";
				throw error;
			} catch (error) {
				return error as Error;
			}
		}

		it("non-object error yields correct message", () => {
			assert.strictEqual(
				extractLogSafeErrorProperties("hello", false /* sanitizeStack */).message,
				"hello",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(42, false /* sanitizeStack */).message,
				"42",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(true, false /* sanitizeStack */).message,
				"true",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(undefined, false /* sanitizeStack */).message,
				"undefined",
			);
		});
		it("object error yields correct message", () => {
			assert.strictEqual(
				extractLogSafeErrorProperties({ message: "hello" }, false /* sanitizeStack */).message,
				"hello",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties({ message: 42 }, false /* sanitizeStack */).message,
				"[object Object]",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties({ foo: 42 }, false /* sanitizeStack */).message,
				"[object Object]",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties([1, 2, 3], false /* sanitizeStack */).message,
				"1,2,3",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(null, false /* sanitizeStack */).message,
				"null",
			);
		});
		it("extract errorType", () => {
			assert.strictEqual(
				extractLogSafeErrorProperties({ errorType: "hello" }, false /* sanitizeStack */)
					.errorType,
				"hello",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties({ foo: "hello" }, false /* sanitizeStack */).errorType,
				undefined,
			);
			assert.strictEqual(
				extractLogSafeErrorProperties({ errorType: 42 }, false /* sanitizeStack */).errorType,
				undefined,
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(42, false /* sanitizeStack */).errorType,
				undefined,
			);
		});
		it("extract stack", () => {
			const e1 = createSampleError();

			const stack = extractLogSafeErrorProperties(e1, false /* sanitizeStack */).stack;
			assert(typeof stack === "string");
			assert(stack?.includes("asdf"), "stack is expected to contain the message");
			assert(stack?.includes("FooError"), "stack is expected to contain the name");

			const sanitizedStack = extractLogSafeErrorProperties(e1, true /* sanitizeStack */).stack;
			assert(typeof sanitizedStack === "string");
			assert(
				!sanitizedStack?.includes("asdf"),
				"message should have been removed from sanitized stack",
			);
			assert(
				sanitizedStack?.includes("FooError"),
				"name should still be in the sanitized stack",
			);
		});
		it("extract stack non-standard values", () => {
			// sanitizeStack true
			assert.strictEqual(
				extractLogSafeErrorProperties({ stack: "hello" }, true /* sanitizeStack */).stack,
				"",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(
					{ stack: "hello", name: "name" },
					true /* sanitizeStack */,
				).stack,
				"name",
			);
			// sanitizeStack false
			assert.strictEqual(
				extractLogSafeErrorProperties({ stack: "hello" }, false /* sanitizeStack */).stack,
				"hello",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(
					{ stack: "hello", name: "name" },
					false /* sanitizeStack */,
				).stack,
				"hello",
			);
			assert.strictEqual(
				extractLogSafeErrorProperties({ foo: "hello" }, false /* sanitizeStack */).stack,
				undefined,
			);
			assert.strictEqual(
				extractLogSafeErrorProperties({ stack: 42 }, false /* sanitizeStack */).stack,
				undefined,
			);
			assert.strictEqual(
				extractLogSafeErrorProperties(42, false /* sanitizeStack */).stack,
				undefined,
			);
		});
	});
	describe("normalizeError", () => {
		describe("preserves properties", () => {
			it("missing properties are not set", () => {
				// eslint-disable-next-line unicorn/error-message
				const unknownError = new Error();

				const newError: IFluidErrorBase & {
					canRetry?: boolean;
					retryAfterSeconds?: number;
				} = normalizeError(unknownError);

				assert.strictEqual(newError.canRetry, undefined, "canRetry not undefined");
				assert.strictEqual(
					newError.retryAfterSeconds,
					undefined,
					"retryAfterSeconds not undefined",
				);
			});
			it("existing retry properties are present in normalized error", () => {
				const unknownError: { canRetry?: boolean; retryAfterSeconds?: number } & Error =
					// eslint-disable-next-line unicorn/error-message
					new Error();
				unknownError.canRetry = true;
				unknownError.retryAfterSeconds = 100;

				const newError: IFluidErrorBase & {
					canRetry?: boolean;
					retryAfterSeconds?: number;
				} = normalizeError(unknownError);

				assert.strictEqual(newError.canRetry, true, "canRetry not true");
				assert.strictEqual(newError.retryAfterSeconds, 100, "retryAfterSeconds not 100");
			});
		});
	});
});

class TestFluidError implements IFluidErrorBase {
	public readonly atpStub: sinon.SinonStub;
	public readonly gtpSpy: sinon.SinonSpy;
	public expectedTelemetryProps: ITelemetryBaseProperties;

	public readonly errorType: string;
	public readonly message: string;
	public readonly stack?: string;
	public readonly name: string = "Error";
	public readonly errorInstanceId: string;

	public constructor(
		errorProps: Omit<
			IFluidErrorBase,
			| "getTelemetryProperties"
			| "addTelemetryProperties"
			| "errorInstanceId"
			| "name"
			| "cause"
		>,
	) {
		this.errorType = errorProps.errorType;
		this.message = errorProps.message;
		this.stack = errorProps.stack;
		this.errorInstanceId = uuid();

		this.atpStub = sinon.stub(this, "addTelemetryProperties");
		this.gtpSpy = sinon.spy(this, "getTelemetryProperties");
		this.expectedTelemetryProps = { ...errorProps };
	}

	public getTelemetryProperties(): ITelemetryBaseProperties {
		// Don't actually return any props. We'll use the spy to ensure it was called
		return {};
	}

	public addTelemetryProperties(props: ITelemetryPropertiesExt): void {
		throw new Error("Not Implemented - Expected to be Stubbed via Sinon");
	}

	public withoutProperty(propName: keyof IFluidErrorBase): this {
		const objectWithoutProp = {};
		objectWithoutProp[propName] = undefined;
		Object.assign(this, objectWithoutProp);
		return this;
	}

	public withExpectedTelemetryProps(props: ITelemetryBaseProperties): this {
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
			it(`Valid Fluid Error - untouched (annotations: ${annotationCase})`, () => {
				// Arrange
				const fluidError = new TestFluidError({ errorType: "et1", message: "m1" });
				// We don't expect legacyError to be modified itself at all
				Object.freeze(fluidError);

				// Act
				const normalizedError = normalizeError(fluidError, annotations);

				// Assert
				assert(normalizedError === fluidError);
				if (annotations.props !== undefined) {
					assert(
						fluidError.atpStub.calledWith(annotations.props),
						"addTelemetryProperties should have been called",
					);
				}
			});
		}
		it("Valid Fluid Error - stack not added if missing", () => {
			// Arrange
			const fluidError = new TestFluidError({
				errorType: "et1",
				message: "m1",
			}).withoutProperty("stack");
			// We don't expect fluidError to be modified itself at all
			Object.freeze(fluidError);

			// Act
			const normalizedError = normalizeError(fluidError, {});

			// Assert
			assert(normalizedError === fluidError);
			assert(normalizedError.stack === undefined);
		});
	});
	describe("Errors Needing Normalization", () => {
		class NamedError extends Error {
			public name = "CoolErrorName";
		}
		const sampleFluidError = (): TestFluidError =>
			new TestFluidError({
				errorType: "someType",
				message: "Hello",
				stack: "cool stack trace",
			});
		const typicalOutput = (
			message: string,
			stackHint: "<<natural stack>>" | "<<stack from input>>",
		): TestFluidError =>
			new TestFluidError({
				errorType: "genericError",
				message,
				stack: stackHint,
			});
		const testCases: Record<string, () => { input: any; expectedOutput: TestFluidError }> = {
			"Fluid Error minus errorType": () => ({
				input: sampleFluidError().withoutProperty("errorType"),
				expectedOutput: typicalOutput("Hello", "<<stack from input>>"),
			}),
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
				expectedOutput: typicalOutput(
					"boom",
					"<<stack from input>>",
				).withExpectedTelemetryProps({ untrustedOrigin: 1 }),
			}),
			"LoggingError": () => ({
				input: new LoggingError("boom"),
				expectedOutput: typicalOutput("boom", "<<stack from input>>"),
			}),
			"Empty object": () => ({
				input: {},
				expectedOutput: typicalOutput(
					"[object Object]",
					"<<natural stack>>",
				).withExpectedTelemetryProps({ untrustedOrigin: 1 }),
			}),
			"object with stack": () => ({
				input: { message: "whatever", stack: "fake stack goes here" },
				expectedOutput: typicalOutput(
					"whatever",
					"<<stack from input>>",
				).withExpectedTelemetryProps({ untrustedOrigin: 1 }),
			}),
			"object with non-string message and name": () => ({
				input: { message: 42, name: true },
				expectedOutput: typicalOutput(
					"[object Object]",
					"<<natural stack>>",
				).withExpectedTelemetryProps({ untrustedOrigin: 1 }),
			}),
			"nullValue": () => ({
				input: null,
				expectedOutput: typicalOutput("null", "<<natural stack>>").withExpectedTelemetryProps({
					untrustedOrigin: 1,
				}),
			}),
			"undef": () => ({
				input: undefined,
				expectedOutput: typicalOutput(
					"undefined",
					"<<natural stack>>",
				).withExpectedTelemetryProps({ typeofError: "undefined", untrustedOrigin: 1 }),
			}),
			"false": () => ({
				input: false,
				expectedOutput: typicalOutput("false", "<<natural stack>>").withExpectedTelemetryProps(
					{ typeofError: "boolean", untrustedOrigin: 1 },
				),
			}),
			"true": () => ({
				input: true,
				expectedOutput: typicalOutput("true", "<<natural stack>>").withExpectedTelemetryProps({
					typeofError: "boolean",
					untrustedOrigin: 1,
				}),
			}),
			"number": () => ({
				input: 3.14,
				expectedOutput: typicalOutput("3.14", "<<natural stack>>").withExpectedTelemetryProps({
					typeofError: "number",
					untrustedOrigin: 1,
				}),
			}),
			"symbol": () => ({
				input: Symbol("Unique"),
				expectedOutput: typicalOutput(
					"Symbol(Unique)",
					"<<natural stack>>",
				).withExpectedTelemetryProps({ typeofError: "symbol", untrustedOrigin: 1 }),
			}),
			"function": () => ({
				input: (): void => {},
				expectedOutput: typicalOutput(
					"() => { }",
					"<<natural stack>>",
				).withExpectedTelemetryProps({ typeofError: "function", untrustedOrigin: 1 }),
			}),
			"emptyArray": () => ({
				input: [],
				expectedOutput: typicalOutput("", "<<natural stack>>").withExpectedTelemetryProps({
					untrustedOrigin: 1,
				}),
			}),
			"array": () => ({
				input: [1, 2, 3],
				expectedOutput: typicalOutput("1,2,3", "<<natural stack>>").withExpectedTelemetryProps(
					{ untrustedOrigin: 1 },
				),
			}),
		};
		function assertMatching(
			actual: IFluidErrorBase,
			expected: TestFluidError,
			annotations: IFluidErrorAnnotations = {},
			inputStack: string | undefined,
		): void {
			expected.withExpectedTelemetryProps({
				...annotations.props,
				errorInstanceId: actual.errorInstanceId,
			});

			assertMatchingMessageAndStack(actual, expected, inputStack);

			assert.equal(actual.errorType, expected.errorType, "errorType should match");
			assert.equal(actual.name, expected.name, "name should match");
			assert.equal(actual.errorInstanceId.length, 36, "should be guid-length");
			assert.deepStrictEqual(
				actual.getTelemetryProperties(),
				expected.expectedTelemetryProps,
				"telemetry props should match",
			);
		}
		function assertMatchingMessageAndStack(
			actual: IFluidErrorBase,
			expected: TestFluidError,
			inputStack: string | undefined,
		): void {
			assert.equal(actual.message, expected.message, "message should match");
			const actualStack = actual.stack;
			assert(actualStack !== undefined, "stack should be present as a string");
			if (actualStack.includes("at normalizeError")) {
				// This indicates the stack was populated naturally by new SimpleFluidError
				assert.equal(
					expected.stack,
					"<<natural stack>>",
					"<<natural stack>> hint should be used if not overwritten",
				);
				expected.withExpectedTelemetryProps({ stack: actualStack });
			} else {
				assert.equal(
					actualStack,
					inputStack,
					"If stack wasn't generated, it should match input stack",
				);
				assert.equal(
					expected.stack,
					"<<stack from input>>",
					"<<stack from input>> hint should be used if using stack from input error object",
				);
				expected.withExpectedTelemetryProps({ stack: inputStack });
			}
		}
		for (const [annotationCase, annotations] of Object.entries(annotationCases)) {
			let doneOnceForThisAnnotationCase = false;
			for (const [caseName, getTestCase] of Object.entries(testCases)) {
				if (!doneOnceForThisAnnotationCase) {
					doneOnceForThisAnnotationCase = true;
					// Each test case only differs by what stack/error are.  Test the rest only once per annotation case.
					it(`Normalize untrusted error full validation: (${annotationCase})`, () => {
						// Arrange
						const { input, expectedOutput } = getTestCase();

						// Act
						const normalized = normalizeError(input, annotations);

						// Assert
						assert.notEqual(input, normalized, "input should have yielded a new error object");
						assertMatching(normalized, expectedOutput, annotations, input?.stack);
						if (
							input instanceof TestFluidError &&
							input.getTelemetryProperties !== undefined
						) {
							assert(
								input.gtpSpy.calledOnce,
								"input.getTelemetryProperties should have been called by normalizeError",
							);
						}

						// Bonus
						normalized.addTelemetryProperties({ foo: "bar" });
						assert.equal(
							normalized.getTelemetryProperties().foo,
							"bar",
							"can add telemetry props after normalization",
						);
					});
				}
				it(`Normalize untrusted error message/stack: ${caseName} (${annotationCase})`, () => {
					// Arrange
					const { input, expectedOutput } = getTestCase();

					// Act
					const normalized = normalizeError(input, annotations);

					// Assert
					assert.notEqual(input, normalized, "input should have yielded a new error object");
					assertMatchingMessageAndStack(normalized, expectedOutput, input?.stack);
				});
			}
		}
	});
});

/**
 * Create an error missing errorType that will not be recognized as a valid Fluid error
 */
const createExternalError = (m: string): Error => new Error(m);

/**
 * Create a simple valid Fluid error
 */
const createTestError = (
	m: string,
): LoggingError & {
	errorType: string;
} =>
	Object.assign(new LoggingError(m), {
		errorType: "someErrorType",
	});

describe("wrapError", () => {
	it("Copy message, stack, and props", () => {
		const innerError = new LoggingError("hello", { someProp: 123 });
		innerError.stack = "extra special stack";
		const newError = wrapError(innerError, createTestError);
		assert.equal(newError.message, innerError.message, "messages should match");
		assert.equal(newError.stack, innerError.stack, "stacks should match");
		assert.equal(newError.getTelemetryProperties().someProp, 123, "Props should be preserved");
	});
	it("Include matching errorInstanceId and innerErrorInstanceId in telemetry props", () => {
		const innerError = new LoggingError("hello");
		const newError = wrapError(innerError, createTestError);
		assert(newError.errorInstanceId === innerError.errorInstanceId);
		assert(
			newError.getTelemetryProperties().innerErrorInstanceId === innerError.errorInstanceId,
		);
	});
	it("Properly set untrustedOrigin", () => {
		const untrustedError = createExternalError("untrusted");

		const singleWrapped = wrapError(untrustedError, createTestError);
		assert(
			singleWrapped.getTelemetryProperties().untrustedOrigin === 1,
			"wrapped external error should be 'untrustedOrigin'",
		);

		const doubleWrapped = wrapError(singleWrapped, createTestError);
		assert(
			doubleWrapped.getTelemetryProperties().untrustedOrigin === 1,
			"doubly-wrapped external error should be 'untrustedOrigin'",
		);

		const normalizedError = normalizeError(untrustedError);
		const wrappedNormalized = wrapError(normalizedError, createTestError);
		assert(
			wrappedNormalized.getTelemetryProperties().untrustedOrigin === 1,
			"normalized-then-wrapped external error should be 'untrustedOrigin'",
		);

		const trustedError = createTestError("trusted");
		const wrappedTrusted = wrapError(trustedError, createTestError);
		assert(
			wrappedTrusted.getTelemetryProperties().untrustedOrigin === undefined,
			"wrapped Fluid error should not be 'untrustedOrigin'",
		);
	});
});
describe("wrapErrorAndLog", () => {
	const mockLogger = new MockLogger();
	const innerError = new LoggingError("hello");
	const newError = wrapErrorAndLog(
		innerError,
		createTestError,
		mockLogger.toTelemetryLogger(),
	);
	assert(
		mockLogger.matchEvents([
			{
				eventName: "WrapError",
				wrappedByErrorInstanceId: newError.errorInstanceId,
				errorInstanceId: newError.errorInstanceId,
				error: "hello",
			},
		]),
		"Expected the 'WrapError' event to be logged",
	);
});

describe("Error Discovery", () => {
	it("isExternalError", () => {
		assert(isExternalError("some string"));
		assert(isExternalError(createExternalError("error message")));
		assert(isExternalError(normalizeError("normalize me but I'm still external")));
		assert(
			isExternalError(
				normalizeError(createExternalError("normalize me but I'm still external")),
			),
		);

		assert(!isExternalError(createTestError("hello")));

		const wrappedError = wrapError("wrap me", createTestError);
		assert(!isExternalError(wrappedError));
		assert(wrappedError.getTelemetryProperties().untrustedOrigin === 1); // But it should still say untrustedOrigin

		const loggingError = new LoggingError("testLoggingError");
		assert(!isExternalError(loggingError), "new LoggingError is not external");
		assert(
			!isExternalError(normalizeError(loggingError)),
			"normalized LoggingError is not external",
		);

		// Future compat - Eventually we want to switch untrustedOrigin to errorRunningExternalCode, so set up "read" code now in 2.0
		assert(
			isExternalError(
				normalizeError(loggingError, { props: { errorRunningExternalCode: 1 } }),
			),
			"normalized loggingError with errorRunningExternalCode flag is external",
		);

		// Future compat - Eventually we want to switch untrustedOrigin to errorRunningExternalCode, so set up "read" code now in 2.0
		assert(
			isExternalError(
				normalizeError(loggingError, { props: { errorRunningExternalCode: "callback" } }),
			),
			"normalized loggingError with errorRunningExternalCode string value is external",
		);
	});

	it("isFluidError", () => {
		assert(!isFluidError(new Error("hello")), "Plain Error object is not a Fluid Error");
		assert(
			!isFluidError(new LoggingError("hello")),
			"LoggingError is not a Fluid Error (no errorType)",
		);
		assert(
			!isFluidError(
				Object.assign(new Error("hello"), {
					errorType: "someErrorType",
					_errorInstanceId: "12345",
				}),
			),
			"Error with errorType and errorInstanceId but without telemetry prop fns is not a Fluid Error",
		);
		assert(
			!isFluidError(createExternalError("hello")),
			"Error without errorType is not a Fluid Error",
		);
		assert(
			!isFluidError(Object.assign(createTestError("hello"), { _errorInstanceId: undefined })),
			"Valid Fluid Error with errorInstanceId removed is not a Fluid Error",
		);
		assert(isFluidError(createTestError("hello")), "Valid Fluid Error is a Fluid Error");
	});
});

describe("generateStack Tests", () => {
	function a(stackTraceLimit?: number): string | undefined {
		return generateStack(stackTraceLimit);
	}

	function b(stackTraceLimit?: number): string | undefined {
		return a(stackTraceLimit);
	}

	function c(stackTraceLimit?: number): string | undefined {
		return b(stackTraceLimit);
	}
	it("Show stack trace with a given stackTraceLimit", () => {
		const originalLimit = Error.stackTraceLimit;
		const stack = c(1)?.split("\n");
		assert(stack !== undefined);
		assert(stack.length === 2);
		assert(stack[0].includes("<<generated stack>>"));
		assert(stack[1].includes("at generateErrorWithStack"));
		assert(originalLimit === Error.stackTraceLimit);
	});
});
