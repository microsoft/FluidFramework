/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ILoggingError,
    ITaggedTelemetryPropertyType,
    ITelemetryLogger,
    ITelemetryProperties,
    TelemetryEventPropertyType,
} from "@fluidframework/common-definitions";
import { v4 as uuid } from "uuid";
import {
    hasErrorInstanceId,
    IFluidErrorBase,
    isFluidError,
    isValidLegacyError,
} from "./fluidErrorBase";

/** @returns true if value is an object but neither null nor an array */
const isRegularObject = (value: any): boolean => {
    return value !== null && !Array.isArray(value) && typeof value === "object";
};

/** Inspect the given error for common "safe" props and return them */
export function extractLogSafeErrorProperties(error: any, sanitizeStack: boolean) {
    const removeMessageFromStack = (stack: string, errorName?: string) => {
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

    const message = (typeof error?.message === "string")
        ? error.message as string
        : String(error);

    const safeProps: { message: string; errorType?: string; stack?: string; } = {
        message,
    };

    if (isRegularObject(error)) {
        const { errorType, stack, name } = error;

        if (typeof errorType === "string") {
            safeProps.errorType = errorType;
        }

        if (typeof stack === "string") {
            const errorName = (typeof name === "string") ? name : undefined;
            safeProps.stack = removeMessageFromStack(stack, errorName);
        }
    }

    return safeProps;
}

/** type guard for ILoggingError interface */
export const isILoggingError = (x: any): x is ILoggingError => typeof x?.getTelemetryProperties === "function";

/** Copy props from source onto target, but do not overwrite an existing prop that matches */
function copyProps(target: ITelemetryProperties | LoggingError, source: ITelemetryProperties) {
    for (const key of Object.keys(source)) {
        if (target[key] === undefined) {
            target[key] = source[key];
        }
    }
}

/** Metadata to annotate an error object when annotating or normalizing it */
export interface IFluidErrorAnnotations {
    /** Telemetry props to log with the error */
    props?: ITelemetryProperties;
}

/** For backwards compatibility with pre-errorInstanceId valid errors */
function patchLegacyError(
    legacyError: Omit<IFluidErrorBase, "errorInstanceId">,
): asserts legacyError is IFluidErrorBase {
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
    const fluidError: IFluidErrorBase = new NormalizedExternalError({
        message,
        stack,
    });

    // We need to preserve these properties which are used in a non-typesafe way throughout driver code (see #8743)
    // Anywhere they are set should be on a valid Fluid Error that would have been returned above,
    // but we can't prove it with the types, so adding this defensive measure.
    if (typeof error === "object" && error !== null) {
        const { canRetry, retryAfterSeconds } = error as any;
        Object.assign(normalizeError, { canRetry, retryAfterSeconds });
    }

    if (typeof (error) !== "object") {
        // This is only interesting for non-objects
        fluidError.addTelemetryProperties({ typeofError: typeof (error) });
    }

    const originalErrorTelemetryProps = isILoggingError(error) ? error.getTelemetryProperties() : {};
    fluidError.addTelemetryProperties({
        ...originalErrorTelemetryProps,
        ...annotations.props,
        untrustedOrigin: 1, // This will let us filter to errors not originated by our own code
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
 */
 export function generateErrorWithStack(): Error {
    const err = new Error("<<generated stack>>");

    if (stackPopulatedOnCreation === undefined) {
        stackPopulatedOnCreation = (err.stack !== undefined);
    }

    if (stackPopulatedOnCreation) {
        return err;
    }

    try {
        throw err;
    } catch (e) {
        return e as Error;
    }
}

export function generateStack(): string | undefined {
    return generateErrorWithStack().stack;
}

/**
 * Create a new error using newErrorFn, wrapping and caused by the given unknown error.
 * Copies the inner error's stack, errorInstanceId and telemetry props over to the new error if present
 * @param innerError - An error from untrusted/unknown origins
 * @param newErrorFn - callback that will create a new error given the original error's message
 * @returns A new error object "wrapping" the given error
 */
export function wrapError<T extends LoggingError>(
    innerError: unknown,
    newErrorFn: (message: string) => T,
): T {
    const {
        message,
        stack,
    } = extractLogSafeErrorProperties(innerError, false /* sanitizeStack */);

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

/** The same as wrapError, but also logs the innerError, including the wrapping error's instance id */
export function wrapErrorAndLog<T extends LoggingError>(
    innerError: unknown,
    newErrorFn: (message: string) => T,
    logger: ITelemetryLogger,
) {
    const newError = wrapError(innerError, newErrorFn);

    // This will match innerError.errorInstanceId if present (see wrapError)
    const errorInstanceId = newError.errorInstanceId;

    // For "back-compat" in the logs
    const wrappedByErrorInstanceId = errorInstanceId;

    logger.sendTelemetryEvent({
        eventName: "WrapError",
        errorInstanceId,
        wrappedByErrorInstanceId,
    }, innerError);

    return newError;
}

function overwriteStack(error: IFluidErrorBase | LoggingError, stack: string) {
    // supposedly setting stack on an Error can throw.
    try {
        Object.assign(error, { stack });
    } catch (errorSettingStack) {
        error.addTelemetryProperties({ stack2: stack });
    }
}

/**
 * True for any error object that is an (optionally normalized) external error
 * False for any error we created and raised within the FF codebase, or wrapped in a well-known error type
 */
export function isExternalError(e: any): boolean {
    return !isValidLegacyError(e) ||
        (e.getTelemetryProperties().untrustedOrigin === 1 &&
         e.errorType === NormalizedExternalError.normalizedErrorType);
}

/**
 * Type guard to identify if a particular value (loosely) appears to be a tagged telemetry property
 */
export function isTaggedTelemetryPropertyValue(x: any): x is ITaggedTelemetryPropertyType {
    return typeof (x?.tag) === "string";
}

/**
 * Filter serializable telemetry properties
 * @param x - any telemetry prop
 * @returns - as-is if x is primitive. returns stringified if x is an array of primitive.
 * otherwise returns null since this is what we support at the moment.
 */
function filterValidTelemetryProps(x: any, key: string): TelemetryEventPropertyType {
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
function isTelemetryEventPropertyValue(x: any): x is TelemetryEventPropertyType {
    switch (typeof x) {
        case "string":
        case "number":
        case "boolean":
        case "undefined":
            return true;
        default:
            return false;
    }
}
/**
 * Walk an object's enumerable properties to find those fit for telemetry.
 */
function getValidTelemetryProps(obj: any, keysToOmit: Set<string>): ITelemetryProperties {
    const props: ITelemetryProperties = {};
    for (const key of Object.keys(obj)) {
        if (keysToOmit.has(key)) {
            continue;
        }
        const val = obj[key];

        // ensure only valid props get logged, since props of logging error could be in any shape
        if (isTaggedTelemetryPropertyValue(val)) {
            props[key] = {
                value: filterValidTelemetryProps(val.value, key),
                tag: val.tag,
            };
        } else {
            props[key] = filterValidTelemetryProps(val, key);
        }
    }
    return props;
}

/**
 * Borrowed from
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples}
 * Avoids runtime errors with circular references.
 * Not ideal, as will cut values that are not necessarily circular references.
 * Could be improved by implementing Node's util.inspect() for browser (minus all the coloring code)
*/
export const getCircularReplacer = () => {
    const seen = new WeakSet();
    return (key: string, value: any): any => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "<removed/circular>";
            }
            seen.add(value);
        }
        return value;
    };
};

/**
 * Base class for "trusted" errors we create, whose properties can generally be logged to telemetry safely.
 * All properties set on the object, or passed in (via the constructor or addTelemetryProperties),
 * will be logged in accordance with their tag, if present.
 *
 * PLEASE take care to avoid setting sensitive data on this object without proper tagging!
 */
export class LoggingError extends Error implements ILoggingError, Omit<IFluidErrorBase, "errorType"> {
    private _errorInstanceId = uuid();
    get errorInstanceId() { return this._errorInstanceId; }
    overwriteErrorInstanceId(id: string) { this._errorInstanceId = id; }

    /** Back-compat to appease isFluidError typeguard in old code that may handle this error */
    // @ts-expect-error - This field shouldn't be referenced in the current version, but needs to exist at runtime.
    private readonly fluidErrorCode: "-" = "-";

    /**
     * Create a new LoggingError
     * @param message - Error message to use for Error base class
     * @param props - telemetry props to include on the error for when it's logged
     * @param omitPropsFromLogging - properties by name to omit from telemetry props
     */
    constructor(
        message: string,
        props?: ITelemetryProperties,
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
     * Add additional properties to be logged
     */
    public addTelemetryProperties(props: ITelemetryProperties) {
        copyProps(this, props);
    }

    /**
     * Get all properties fit to be logged to telemetry for this error
     */
    public getTelemetryProperties(): ITelemetryProperties {
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

/** The Error class used when normalizing an external error */
class NormalizedExternalError extends LoggingError {
    // errorType "genericError" is used as a default value throughout the code.
    // Note that this matches ContainerErrorType/DriverErrorType's genericError
    static readonly normalizedErrorType = "genericError";

    errorType = NormalizedExternalError.normalizedErrorType;

    constructor(
        errorProps: Pick<IFluidErrorBase,
            | "message"
            | "stack"
        >,
    ) {
        super(errorProps.message);

        if (errorProps.stack !== undefined) {
            overwriteStack(this, errorProps.stack);
        }
    }
}
