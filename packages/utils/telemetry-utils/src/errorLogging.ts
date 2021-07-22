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
    IFluidErrorBase,
    isFluidError,
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
 * NOTE: Consider normalizeError before opting to call this directly
 * Mixes in the given properties to the given error object, then accessible via ILoggingError.getTelemetryProperties
 * @param errorObject - An object (MUST be non-null non-array object type, not frozen) to add telemetry features to
 * @param props - The telemetry props to add to the errorObject
 * @returns the same object that was passed in, now also implementing ILoggingError.
 */
export function mixinTelemetryProps<T>(
    errorObject: T,
    props: ITelemetryProperties,
): T & ILoggingError {
    assert(isRegularObject(errorObject) && !Object.isFrozen(errorObject), "Cannot mixin Telemetry Props");

    if (isRwLoggingError(errorObject)) {
        errorObject.addTelemetryProperties(props);
        return errorObject;
    }

    // Even though it's not exposed, fully implement RwLoggingError for subsequent calls to mixinTelemetryProps
    const loggingError = errorObject as T & RwLoggingError;

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
    mixinTelemetryProps(newError, props);

    if (stack !== undefined) {
        Object.assign(newError, { stack });
    }

    return newError;
}

/**
 * Patch the given builder with all existing properties on the template
 * @returns The same object as builder, but with additional properties
 */
function patchFluidErrorBuilder(
    builder: FluidErrorBuilder,
    template: IFluidErrorBase,
): IFluidErrorBase {
    assert(!Object.isFrozen(builder), "Cannot patch frozen error builder");

    builder.errorType = template.errorType;
    builder.fluidErrorCode = template.fluidErrorCode;
    if (template.message !== undefined) {
        builder.message = template.message;
    }
    if (template.name !== undefined) {
        builder.name = template.name;
    }
    if (template.stack !== undefined) {
        builder.stack = template.stack;
    }
    // This cast is legit since we certainly added the only two required properties of IFluidErrorBase
    return builder as IFluidErrorBase;
}

function mixinTelemetryPropsWithFluidError(error: IFluidErrorBase, props?: ITelemetryProperties) {
    const { errorType, fluidErrorCode } = error;
    return mixinTelemetryProps(error, { ...props, errorType, fluidErrorCode });
}

/** Helper type that makes IFluidErrorBuilder's props mutable and optional for building one up on an existing object */
type FluidErrorBuilder = {
    -readonly [P in keyof IFluidErrorBase]?: IFluidErrorBase[P];
};

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
    // If we already have a valid Fluid Error, then just mixin telemetry props
    if (isFluidError(error)) {
        return mixinTelemetryPropsWithFluidError(error, annotations.props);
    }

    // We will get an object (ideally the passed-in error itself) and patch in any missing properties of IFluidErrorBase
    let fluidErrorBuilder: FluidErrorBuilder;
    let errorTypeIfNone: string;
    if (isRegularObject(error) && !Object.isFrozen(error)) {
        // error is an object we can patch, use it as the builder directly
        fluidErrorBuilder = error as FluidErrorBuilder;
        errorTypeIfNone = isErrorLike(error)
            ? error.name
            : typeof(error);
    } else {
        // We can't patch error itself, so wrap it in a new LoggingError for the builder
        const newErrorFn = (errMsg: string) => new LoggingError(errMsg);
        fluidErrorBuilder = wrapError<LoggingError>(error, newErrorFn) as FluidErrorBuilder;
        errorTypeIfNone = !isRegularObject(error) ? typeof(error) : "wrappedFrozenError";
    }

    const fluidError = patchFluidErrorBuilder(
        fluidErrorBuilder,
        {
            errorType: typeof fluidErrorBuilder.errorType === "string"
                ? fluidErrorBuilder.errorType
                : `none (${errorTypeIfNone})`,
            fluidErrorCode: annotations.errorCodeIfNone === undefined
                ? "none" // We already know fluidErrorBuilder doesn't have a fluidErrorCode
                : `none (${annotations.errorCodeIfNone})`,
            stack: typeof fluidErrorBuilder.stack === "string"
                ? undefined // This means don't patch the stack property (since it's already ok)
                : new Error("<<generated stack>>").stack,
        },
    );

    return mixinTelemetryPropsWithFluidError(fluidError, annotations.props);
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
