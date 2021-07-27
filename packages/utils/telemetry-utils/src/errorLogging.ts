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
    isILoggingError,
    isErrorLike,
    isFluidError,
    hasErrorType,
} from "./staging";
import {
    extractLogSafeErrorProperties,
    isRegularObject,
    mixinTelemetryProps,
    copyProps,
} from "./errorLoggingInternalHelpers";

/** Metadata to annotate an error object when annotating or normalizing it */
export interface FluidErrorAnnotations {
    /** Telemetry props to log with the error */
    props?: ITelemetryProperties;
    //* Get a better name
    normalizeHint?: string;
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
 * Normalize the given error yielding a valid Fluid Error
 * @returns A valid Fluid Error with any provided annotations applied
 * @param error - The error to normalize
 * @param annotations - Annotations to apply to the normalized error
 */
export function normalizeError(
    error: unknown,
    annotations: FluidErrorAnnotations = {},
): IFluidErrorBase {
    //* NOTE - Callers who have an "old"-style "trusted" error should patch it themselves to hit this code path
    if (isFluidError(error) && !Object.isFrozen(error)) {
        // We can simply annotate the error and return it
        annotateFluidError(error, annotations);
        return error;
    }

    const originalErrorObject = isRegularObject(error) ? error : { message: String(error) };

    // We'll construct a new fluid error copying certain properties over if present
    const errorTypeIfNone3 = hasErrorType(error)
        ? error.errorType  //* BUT: we won't be copying over other props or functions that errorType may imply
        : isErrorLike(error)
            ? error.name
            : typeof(error);
    const fluidError = patchFluidErrorBuilder(
        new LoggingError(""), //* Could just do {}
        prepareFluidErrorTemplate(originalErrorObject, errorTypeIfNone3),
    );

    mixinTelemetryPropsWithFluidError(fluidError, annotations);
    return fluidError;
}

//* Add new tsdoc comment
export function annotateFluidError(
    fluidError: IFluidErrorBase,
    annotations: FluidErrorAnnotations = {},  //* Just take props, not errorCodeIfNone
): asserts fluidError is IFluidErrorBase {
    // This assert would only be hit if someone did some dubious casting, or intentionally froze a known fluidError.
    assert(isFluidError(fluidError) && !Object.isFrozen(fluidError),
        "Cannot annotate the given fluidError");

    mixinTelemetryPropsWithFluidError(fluidError, annotations);
}

/**
 * Helper type, not exported.
 * Makes IFluidErrorBuilder's props mutable and optional for building one up on an existing object
 */
type FluidErrorBuilder = {
    -readonly [P in keyof IFluidErrorBase]?: IFluidErrorBase[P];
};

/**
 * Prepares a template IFluidErrorBase based on the inputs provided, for use with patchFluidErrorBuilder
 * @param originalErrorObject - Object to check for IFluidErrorBase properties to use for the template
 * @param errorTypeIfNone - errorType to use if none is found on originalErrorObject
 * @param errorCodeIfNone - fluidErrorCode to use if none is found on originalErrorObject
 * @returns a template IFluidErrorBase with values based on the inputs provided, for use with patchFluidErrorBuilder
 */
function prepareFluidErrorTemplate(
    originalErrorObject: unknown,
    errorTypeIfNone: string,
): IFluidErrorBase {
    const fullErrorTypeIfNone = `none (${errorTypeIfNone})`;
    // Pull each of IFluidErrorBase's properties off the originalError, regardless of their type
    const { errorType, fluidErrorCode, message, name, stack } =
        originalErrorObject as { [P in keyof IFluidErrorBase]: unknown; };
    return {
        errorType:
            typeof errorType === "string"
                ? errorType
                : fullErrorTypeIfNone,
        fluidErrorCode:
            typeof fluidErrorCode === "string"
                ? fluidErrorCode
                : "none",
        message:
            typeof message === "string" || message === undefined
                ? message
                : String(message),
        name:
            typeof name === "string" || name === undefined
                ? name
                : String(name),
        stack:
            typeof stack === "string"
                ? stack
                : new Error("<<generated stack>>").stack,
    };
}

/**
 * Patch the given builder with all existing properties on the template
 * @returns The same object as builder, but with additional properties
 */
function patchFluidErrorBuilder(builder: FluidErrorBuilder, template: IFluidErrorBase): IFluidErrorBase {
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

/** Mixin the telemetry props, along with errorType, fluidErrorCode and normalizeHint */
function mixinTelemetryPropsWithFluidError(
    error: IFluidErrorBase,
    annotations: FluidErrorAnnotations,
) {
    const { errorType, fluidErrorCode } = error;
    const normalizeHint = annotations.normalizeHint;

    // This is a back-compat move, so old loggers will include errorType and fluidErrorCode via prepareErrorObject
    mixinTelemetryProps(error, { ...annotations.props, errorType, fluidErrorCode, normalizeHint });
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
