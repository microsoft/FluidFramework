/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    ILoggingError,
    ITaggedTelemetryPropertyType,
    ITelemetryProperties,
} from "@fluidframework/common-definitions";
import {
    Builder,
    IFluidErrorBase,
    hasErrorType,
    isFluidError,
    ExtensibleObject,
    isILoggingError,
    isErrorLike,
} from "./staging";

/** @returns true if value is an object but neither null nor an array */
const isRegularObject = (value: any): boolean => {
    return value !== null && !Array.isArray(value) && typeof value === "object";
};

/** Inspect the given error for common "safe" props and return them */
export function extractLogSafeErrorProperties(error: any) {
    const removeMessageFromStack = (stack: string, errorName?: string) => {
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

    const safeProps: { message: string; errorType?: string; stack?: string } = {
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

/**
 * Read-Write Logging Error.  Not exported.
 * This type alias includes addTelemetryProperties, and applies to objects even if not instanceof LoggingError\
 */
type RwLoggingError = LoggingError;

/** Type guard for RwLoggingError.  Not exported. */
const isRwLoggingError = (x: any): x is RwLoggingError =>
    typeof x?.addTelemetryProperties === "function" && isILoggingError(x);

/**
 * Mixes in the given properties, accessible henceforth via ILoggingError.getTelemetryProperties
 * @returns the same object that was passed in, now also implementing ILoggingError.
 */
export function mixinTelemetryProps<T extends Record<string, unknown>>(
    error: T,
    props: ITelemetryProperties,
): T & ILoggingError {
    assert(isRegularObject(error) && !Object.isFrozen(error), "Cannot mixin Telemetry Props");

    if (isRwLoggingError(error)) {
        error.addTelemetryProperties(props);
        return error;
    }

    // Even though it's not exposed, fully implement RwLoggingError for subsequent calls to mixingTelemetryProps
    const loggingError = error as T & RwLoggingError;

    const propsForError = {...props};
    loggingError.getTelemetryProperties = () => propsForError;
    loggingError.addTelemetryProperties =
        (newProps: ITelemetryProperties) => { copyProps(propsForError, newProps); };

    return loggingError;
}

/**
 * Take an unknown error object and extract certain known properties to be included in a new error object.
 * The stack is preserved, along with any safe-to-log telemetry props.
 * @param error - An error that was presumably caught, thrown from unknown origins
 * @param newErrorFn - callback that will create a new error given the original error's message
 * @returns A new error object "wrapping" the given error
 */
 export function wrapError<T>(
    error: any,
    newErrorFn: (m: string) => T,
): T {
    const {
        message,
        stack,
    } = extractLogSafeErrorProperties(error);
    const props = isILoggingError(error) ? error.getTelemetryProperties() : {};

    const newError = newErrorFn(message);
    mixinTelemetryProps(newError as ExtensibleObject<T>, props);

    if (stack !== undefined) {
        Object.assign(newError, { stack });
    }

    return newError;
}

/**
 * Normalize the given error object yielding a valid Fluid Error
 * @returns The same error object passed in if possible, normalized and with any provided annotations applied
 */
export function normalizeError(
    error: unknown,
    annotations: {
        props?: ITelemetryProperties,
        errorCodeIfNone?: string,
    } = {},
): IFluidErrorBase {
    // Set up some helpers
    function setErrorTypeIfMissing(builder: Builder<IFluidErrorBase>, errorTypeIfNone: string) {
        if (!hasErrorType(error)) {
            builder.errorType = `none (${errorTypeIfNone})`;
        }
    }
    const fullErrorCodeifNone = annotations.errorCodeIfNone === undefined
        ? "none"
        : `none (${annotations.errorCodeIfNone})`;

    // We'll be sure to set all properties on here before casting to IFluidErrorBase and returning
    let fluidErrorBuilder: Builder<IFluidErrorBase>;

    // If we can't annotate the error, wrap it
    if (!isRegularObject(error) || Object.isFrozen(error)) {
        const errorType = !isRegularObject(error) ? typeof(error) : "wrappedFrozenError";
        const newErrorFn = (errMsg: string) => {
            fluidErrorBuilder = new LoggingError(errMsg, annotations.props) as Builder<IFluidErrorBase>;
            setErrorTypeIfMissing(fluidErrorBuilder, errorType);
            fluidErrorBuilder.fluidErrorCode = fullErrorCodeifNone;
            return fluidErrorBuilder as IFluidErrorBase;
        };
        return wrapError<IFluidErrorBase>(error, newErrorFn);
    }

    // Do we already have a valid Fluid Error?  Then just mixin telemetry props
    if (isFluidError(error)) {
        return annotations.props !== undefined
            ? mixinTelemetryProps(error as ExtensibleObject<IFluidErrorBase>, annotations.props)
            : error;
    }

    // We have a mutable object, not already a valid Fluid Error. Time to fill in the gaps!
    fluidErrorBuilder = error as Builder<IFluidErrorBase>;
    fluidErrorBuilder.fluidErrorCode = fullErrorCodeifNone;

    if (isErrorLike(error)) {
        setErrorTypeIfMissing(fluidErrorBuilder, error.name);
    } else {
        setErrorTypeIfMissing(fluidErrorBuilder, typeof(error));
        fluidErrorBuilder.message = annotations.errorCodeIfNone;
        fluidErrorBuilder.name = "none";
    }

    if (typeof (fluidErrorBuilder.stack) !== "string") {
        fluidErrorBuilder.stack = new Error("<<generated stack>>").stack;
    }

    const fluidError = fluidErrorBuilder as ExtensibleObject<IFluidErrorBase>;
    return annotations.props !== undefined
        ? mixinTelemetryProps(fluidError, annotations.props)
        : fluidError;
}

/** Copy props from source onto target, overwriting any keys that are already set on target */
function copyProps(target: unknown, source: ITelemetryProperties) {
    Object.assign(target, source);
}

/**
 * Type guard to identify if a particular value (loosely) appears to be a tagged telemetry property
 */
 export function isTaggedTelemetryPropertyValue(x: any): x is ITaggedTelemetryPropertyType {
    return (typeof(x?.value) !== "object" && typeof(x?.tag) === "string");
}

/**
 * Walk an object's enumerable properties to find those fit for telemetry.
 */
function getValidTelemetryProps(obj: any): ITelemetryProperties {
    const props: ITelemetryProperties = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        switch (typeof val) {
            case "string":
            case "number":
            case "boolean":
            case "undefined":
                props[key] = val;
                break;
            default: {
                if (isTaggedTelemetryPropertyValue(val)) {
                    props[key] = val;
                } else {
                    // We don't support logging arbitrary objects
                    props[key] = "REDACTED (arbitrary object)";
                }
                break;
            }
        }
    }
    return props;
}

/**
 * Helper class for error tracking that can be used to log an error in telemetry.
 * The props passed in (and any set directly on the object after the fact) will be
 * logged in accordance with the given tag, if present.
 *
 * PLEASE take care to properly tag properties set on this object
 */
 export class LoggingError extends Error implements ILoggingError {
    constructor(
        message: string,
        props?: ITelemetryProperties,
    ) {
        super(message);
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
        const taggableProps = getValidTelemetryProps(this);
        // Include non-enumerable props inherited from Error that would not be returned by getValidTelemetryProps
        // But if any were overwritten (e.g. with a tagged property), then use the result from getValidTelemetryProps.
        // Not including the 'name' property because it's likely always "Error"
        return  {
            stack: this.stack,
            message: this.message,
            ...taggableProps,
        };
    }
}
