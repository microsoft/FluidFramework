/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ILoggingError,
	ITelemetryBaseProperties,
	TelemetryBaseEventPropertyType,
	Tagged,
} from "@fluidframework/core-interfaces";
import { v4 as uuid } from "uuid";
import {
	hasErrorInstanceId,
	IFluidErrorBase,
	isFluidError,
	isValidLegacyError,
} from "./fluidErrorBase.js";
import { ITelemetryLoggerExt, TelemetryEventPropertyTypeExt } from "./telemetryTypes.js";

/**
 * Determines if the provided value is an object but neither null nor an array.
 */
const isRegularObject = (value: unknown): boolean => {
	return value !== null && !Array.isArray(value) && typeof value === "object";
};

/**
 * Inspect the given error for common "safe" props and return them.
 *
 * @internal
 */
export function extractLogSafeErrorProperties(
	error: unknown,
	sanitizeStack: boolean,
): {
	message: string;
	errorType?: string | undefined;
	stack?: string | undefined;
} {
	const removeMessageFromStack = (stack: string, errorName?: string): string => {
		if (!sanitizeStack) {
			return stack;
		}
		const stackFrames = stack.split("\n");
		stackFrames.shift(); // Remove "[ErrorName]: [ErrorMessage]"
		if (errorName !== undefined) {
			stackFrames.unshift(errorName); // Add "[ErrorName]"
		}
		return stackFrames.join("\n");
	};

	const message =
		typeof (error as Partial<Error>)?.message === "string"
			? (error as Error).message
			: String(error);

	const safeProps: { message: string; errorType?: string; stack?: string } = {
		message,
	};

	if (isRegularObject(error)) {
		const { errorType, stack, name } = error as Partial<IFluidErrorBase>;

		if (typeof errorType === "string") {
			safeProps.errorType = errorType;
		}

		if (typeof stack === "string") {
			const errorName = typeof name === "string" ? name : undefined;
			safeProps.stack = removeMessageFromStack(stack, errorName);
		}
	}

	return safeProps;
}

/**
 * Type-guard for {@link @fluidframework/core-interfaces#ILoggingError}.
 *
 * @internal
 */
export const isILoggingError = (x: unknown): x is ILoggingError =>
	typeof (x as Partial<ILoggingError>)?.getTelemetryProperties === "function";

/**
 * Copy props from source onto target, but do not overwrite an existing prop that matches
 */
function copyProps(
	target: ITelemetryBaseProperties | LoggingError,
	source: ITelemetryBaseProperties,
): void {
	for (const key of Object.keys(source)) {
		if (target[key] === undefined) {
			target[key] = source[key];
		}
	}
}

/**
 * Metadata to annotate an error object when annotating or normalizing it
 *
 * @internal
 */
export interface IFluidErrorAnnotations {
	/**
	 * Telemetry props to log with the error
	 */
	props?: ITelemetryBaseProperties;
}

/**
 * For backwards compatibility with pre-errorInstanceId valid errors
 */
function patchLegacyError(
	legacyError: Omit<IFluidErrorBase, "errorInstanceId">,
): asserts legacyError is IFluidErrorBase {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
	const patchMe: { -readonly [P in "errorInstanceId"]?: IFluidErrorBase[P] } = legacyError as any;
	if (patchMe.errorInstanceId === undefined) {
		patchMe.errorInstanceId = uuid();
	}
}

/**
 * Normalize the given error yielding a valid Fluid Error
 * @returns A valid Fluid Error with any provided annotations applied
 * @param error - The error to normalize
 * @param annotations - Annotations to apply to the normalized error
 *
 * @internal
 */
export function normalizeError(
	error: unknown,
	annotations: IFluidErrorAnnotations = {},
): IFluidErrorBase {
	// Back-compat, while IFluidErrorBase is rolled out
	if (isValidLegacyError(error)) {
		patchLegacyError(error);
	}

	if (isFluidError(error)) {
		// We can simply add the telemetry props to the error and return it
		error.addTelemetryProperties(annotations.props ?? {});
		return error;
	}

	// We have to construct a new Fluid Error, copying safe properties over
	const { message, stack } = extractLogSafeErrorProperties(error, false /* sanitizeStack */);
	const fluidError: IFluidErrorBase = new NormalizedLoggingError({
		message,
		stack,
	});

	// We need to preserve these properties which are used in a non-typesafe way throughout driver code (see #8743)
	// Anywhere they are set should be on a valid Fluid Error that would have been returned above,
	// but we can't prove it with the types, so adding this defensive measure.
	if (typeof error === "object" && error !== null) {
		const maybeHasRetry: Partial<Record<"canRetry" | "retryAfterSeconds", unknown>> = error;
		let retryProps: Partial<Record<"canRetry" | "retryAfterSeconds", unknown>> | undefined;
		if ("canRetry" in error) {
			retryProps ??= {};
			retryProps.canRetry = maybeHasRetry.canRetry;
		}
		if ("retryAfterSeconds" in error) {
			retryProps ??= {};
			retryProps.retryAfterSeconds = maybeHasRetry.retryAfterSeconds;
		}
		if (retryProps !== undefined) {
			Object.assign(fluidError, retryProps);
		}
	}

	if (typeof error !== "object") {
		// This is only interesting for non-objects
		fluidError.addTelemetryProperties({ typeofError: typeof error });
	}

	const errorTelemetryProps = LoggingError.typeCheck(error)
		? error.getTelemetryProperties()
		: { untrustedOrigin: 1 }; // This will let us filter errors that did not originate from our own codebase

	fluidError.addTelemetryProperties({
		...errorTelemetryProps,
		...annotations.props,
	});

	return fluidError;
}

let stackPopulatedOnCreation: boolean | undefined;

/**
 * The purpose of this function is to provide ability to capture stack context quickly.
 * Accessing new Error().stack is slow, and the slowest part is accessing stack property itself.
 * There are scenarios where we generate error with stack, but error is handled in most cases and
 * stack property is not accessed.
 * For such cases it's better to not read stack property right away, but rather delay it until / if it's needed
 * Some browsers will populate stack right away, others require throwing Error, so we do auto-detection on the fly.
 * @returns Error object that has stack populated.
 *
 * @internal
 */
export function generateErrorWithStack(): Error {
	const err = new Error("<<generated stack>>");

	if (stackPopulatedOnCreation === undefined) {
		stackPopulatedOnCreation = err.stack !== undefined;
	}

	if (stackPopulatedOnCreation) {
		return err;
	}

	try {
		throw err;
	} catch (error) {
		return error as Error;
	}
}

/**
 * Generate a stack at this callsite as if an error were thrown from here.
 * @returns the callstack (does not throw)
 *
 * @internal
 */
export function generateStack(): string | undefined {
	return generateErrorWithStack().stack;
}

/**
 * Create a new error using newErrorFn, wrapping and caused by the given unknown error.
 * Copies the inner error's stack, errorInstanceId and telemetry props over to the new error if present
 * @param innerError - An error from untrusted/unknown origins
 * @param newErrorFn - callback that will create a new error given the original error's message
 * @returns A new error object "wrapping" the given error
 *
 * @internal
 */
export function wrapError<T extends LoggingError>(
	innerError: unknown,
	newErrorFn: (message: string) => T,
): T {
	const { message, stack } = extractLogSafeErrorProperties(innerError, false /* sanitizeStack */);

	const newError = newErrorFn(message);

	if (stack !== undefined) {
		overwriteStack(newError, stack);
	}

	// Mark external errors with untrustedOrigin flag
	if (isExternalError(innerError)) {
		newError.addTelemetryProperties({ untrustedOrigin: 1 });
	}

	// Reuse errorInstanceId
	if (hasErrorInstanceId(innerError)) {
		newError.overwriteErrorInstanceId(innerError.errorInstanceId);

		// For "back-compat" in the logs
		newError.addTelemetryProperties({ innerErrorInstanceId: innerError.errorInstanceId });
	}

	// Lastly, copy over all other telemetry properties. Note these will not overwrite existing properties
	// This will include the untrustedOrigin property if the inner error itself was created from an external error
	if (isILoggingError(innerError)) {
		newError.addTelemetryProperties(innerError.getTelemetryProperties());
	}

	return newError;
}

/**
 * The same as wrapError, but also logs the innerError, including the wrapping error's instance ID.
 *
 * @typeParam T - The kind of wrapper error to create.
 *
 * @internal
 */
export function wrapErrorAndLog<T extends LoggingError>(
	innerError: unknown,
	newErrorFn: (message: string) => T,
	logger: ITelemetryLoggerExt,
): T {
	const newError = wrapError(innerError, newErrorFn);

	// This will match innerError.errorInstanceId if present (see wrapError)
	const errorInstanceId = newError.errorInstanceId;

	// For "back-compat" in the logs
	const wrappedByErrorInstanceId = errorInstanceId;

	logger.sendTelemetryEvent(
		{
			eventName: "WrapError",
			errorInstanceId,
			wrappedByErrorInstanceId,
		},
		innerError,
	);

	return newError;
}

/**
 * Attempts to overwrite the error's stack
 *
 * There have been reports of certain JS environments where overwriting stack will throw.
 * If that happens, this adds the given stack as the telemetry property "stack2"
 *
 * @internal
 */
export function overwriteStack(error: IFluidErrorBase | LoggingError, stack: string): void {
	try {
		Object.assign(error, { stack });
	} catch {
		error.addTelemetryProperties({ stack2: stack });
	}
}

/**
 * True for any error object that is an (optionally normalized) external error
 * False for any error we created and raised within the FF codebase via LoggingError base class,
 * or wrapped in a well-known error type
 *
 * @internal
 */
export function isExternalError(error: unknown): boolean {
	// LoggingErrors are an internal FF error type. However, an external error can be converted
	// into a LoggingError if it is normalized. In this case we must use the untrustedOrigin flag to
	// determine whether the original error was infact external.
	if (LoggingError.typeCheck(error)) {
		if ((error as NormalizedLoggingError).errorType === NORMALIZED_ERROR_TYPE) {
			return error.getTelemetryProperties().untrustedOrigin === 1;
		}
		return false;
	}
	return !isValidLegacyError(error);
}

/**
 * Type guard to identify if a particular telemetry property appears to be a
 * {@link @fluidframework/core-interfaces#Tagged} telemetry property.
 *
 * @internal
 */
export function isTaggedTelemetryPropertyValue(
	x: Tagged<TelemetryEventPropertyTypeExt> | TelemetryEventPropertyTypeExt,
): x is Tagged<TelemetryEventPropertyTypeExt> {
	return typeof (x as Partial<Tagged<unknown>>)?.tag === "string";
}

/**
 * Filter serializable telemetry properties
 * @param x - Any telemetry prop
 * @returns As-is if x is primitive. returns stringified if x is an array of primitive.
 * otherwise returns null since this is what we support at the moment.
 */
function filterValidTelemetryProps(x: unknown, key: string): TelemetryBaseEventPropertyType {
	if (Array.isArray(x) && x.every((val) => isTelemetryEventPropertyValue(val))) {
		return JSON.stringify(x);
	}
	if (isTelemetryEventPropertyValue(x)) {
		return x;
	}
	// We don't support logging arbitrary objects
	console.error(`UnSupported Format of Logging Error Property for key ${key}:`, x);
	return "REDACTED (arbitrary object)";
}

// checking type of x, returns false if x is null
function isTelemetryEventPropertyValue(x: unknown): x is TelemetryBaseEventPropertyType {
	switch (typeof x) {
		case "string":
		case "number":
		case "boolean":
		case "undefined": {
			return true;
		}
		default: {
			return false;
		}
	}
}

/**
 * Walk an object's enumerable properties to find those fit for telemetry.
 */
function getValidTelemetryProps(obj: object, keysToOmit: Set<string>): ITelemetryBaseProperties {
	const props: ITelemetryBaseProperties = {};
	for (const key of Object.keys(obj)) {
		if (keysToOmit.has(key)) {
			continue;
		}
		const val = obj[key] as
			| TelemetryEventPropertyTypeExt
			| Tagged<TelemetryEventPropertyTypeExt>;

		// ensure only valid props get logged, since props of logging error could be in any shape
		props[key] = isTaggedTelemetryPropertyValue(val)
			? {
					value: filterValidTelemetryProps(val.value, key),
					tag: val.tag,
			  }
			: filterValidTelemetryProps(val, key);
	}
	return props;
}

/**
 * Borrowed from
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples}
 * Avoids runtime errors with circular references.
 * Not ideal, as will cut values that are not necessarily circular references.
 * Could be improved by implementing Node's util.inspect() for browser (minus all the coloring code)
 *
 * @internal
 */
// TODO: Use `unknown` instead (API breaking change)
/* eslint-disable @typescript-eslint/no-explicit-any */
export const getCircularReplacer = (): ((key: string, value: unknown) => any) => {
	const seen = new WeakSet();
	return (key: string, value: unknown): any => {
		if (typeof value === "object" && value !== null) {
			if (seen.has(value)) {
				return "<removed/circular>";
			}
			seen.add(value);
		}
		return value;
	};
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Base class for "trusted" errors we create, whose properties can generally be logged to telemetry safely.
 * All properties set on the object, or passed in (via the constructor or addTelemetryProperties),
 * will be logged in accordance with their tag, if present.
 *
 * PLEASE take care to avoid setting sensitive data on this object without proper tagging!
 *
 * @internal
 */
export class LoggingError
	extends Error
	implements ILoggingError, Omit<IFluidErrorBase, "errorType">
{
	private _errorInstanceId = uuid();
	get errorInstanceId(): string {
		return this._errorInstanceId;
	}
	overwriteErrorInstanceId(id: string): void {
		this._errorInstanceId = id;
	}

	/**
	 * Backwards compatibility to appease {@link isFluidError} in old code that may handle this error.
	 */
	// @ts-expect-error - This field shouldn't be referenced in the current version, but needs to exist at runtime.
	// eslint-disable-next-line @typescript-eslint/prefer-as-const
	private readonly fluidErrorCode: "-" = "-";

	/**
	 * Create a new LoggingError
	 * @param message - Error message to use for Error base class
	 * @param props - telemetry props to include on the error for when it's logged
	 * @param omitPropsFromLogging - properties by name to omit from telemetry props
	 */
	constructor(
		message: string,
		props?: ITelemetryBaseProperties,
		private readonly omitPropsFromLogging: Set<string> = new Set(),
	) {
		super(message);

		// Don't log this list itself, or the private _errorInstanceId
		omitPropsFromLogging.add("omitPropsFromLogging");
		omitPropsFromLogging.add("_errorInstanceId");

		if (props) {
			this.addTelemetryProperties(props);
		}
	}

	/**
	 * Determines if a given object is an instance of a LoggingError
	 * @param object - any object
	 * @returns true if the object is an instance of a LoggingError, false if not.
	 */
	public static typeCheck(object: unknown): object is LoggingError {
		if (typeof object === "object" && object !== null) {
			return (
				typeof (object as LoggingError).addTelemetryProperties === "function" &&
				typeof (object as LoggingError).getTelemetryProperties === "function" &&
				typeof (object as LoggingError).errorInstanceId === "string"
			);
		}
		return false;
	}

	/**
	 * Add additional properties to be logged
	 */
	public addTelemetryProperties(props: ITelemetryBaseProperties): void {
		copyProps(this, props);
	}

	/**
	 * Get all properties fit to be logged to telemetry for this error
	 */
	public getTelemetryProperties(): ITelemetryBaseProperties {
		const taggableProps = getValidTelemetryProps(this, this.omitPropsFromLogging);
		// Include non-enumerable props that are not returned by getValidTelemetryProps
		return {
			...taggableProps,
			stack: this.stack,
			message: this.message,
			errorInstanceId: this._errorInstanceId,
		};
	}
}

/**
 * The Error class used when normalizing an external error
 *
 * @internal
 */
export const NORMALIZED_ERROR_TYPE = "genericError";

/**
 * Subclass of LoggingError returned by normalizeError
 *
 * @internal
 */
class NormalizedLoggingError extends LoggingError {
	// errorType "genericError" is used as a default value throughout the code.
	// Note that this matches ContainerErrorTypes/DriverErrorTypes' genericError
	errorType = NORMALIZED_ERROR_TYPE;

	constructor(errorProps: Pick<IFluidErrorBase, "message" | "stack">) {
		super(errorProps.message);

		if (errorProps.stack !== undefined) {
			overwriteStack(this, errorProps.stack);
		}
	}
}
