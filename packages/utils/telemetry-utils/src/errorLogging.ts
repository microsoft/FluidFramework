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
    /** fluidErrorCode to mention if error isn't already an IFluidErrorBase */
    errorCodeIfNone?: string;
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
 * @returns The same error object passed in if possible, normalized and with any provided annotations applied
 * @param error - The error to normalize, ideally by patching in the properties of IFluidErrorBase
 * @param annotations - Annotations to apply to the normalized error
 */
export function normalizeError(
    error: unknown,
    annotations: FluidErrorAnnotations = {},
): IFluidErrorBase {
    if (isRegularObject(error) && !Object.isFrozen(error)) {
        // We can simply annotate the error and return it
        annotateErrorObject(error, annotations);
        return error;
    }

    // We can't annotate the error, so we have to wrap it
    const newErrorFn = (errMsg: string) => new LoggingError(errMsg);
    const fluidErrorBuilder = wrapError<LoggingError>(error, newErrorFn) as FluidErrorBuilder;
    const errorTypeIfNone = !isRegularObject(error) ? typeof(error) : "wrappedFrozenError";
    const fluidError = patchFluidErrorBuilder(
        fluidErrorBuilder,
        prepareFluidErrorTemplate(fluidErrorBuilder, errorTypeIfNone, annotations.errorCodeIfNone),
    );

    mixinTelemetryPropsWithFluidError(fluidError, annotations.props);
    return fluidError;
}

/**
 * Annotate the given error object, such that it becomes a valid Fluid Error (and is asserted so via a type guard)
 * If the object is not suitable for annotation (e.g. it's frozen), this will throw.
 * @param error - The error to annotate, ideally by patching in the properties of IFluidErrorBase
 * @param annotations - Annotations to apply to the normalized error
 */
export function annotateErrorObject(
    errorObject: unknown,
    annotations: FluidErrorAnnotations = {},
): asserts errorObject is IFluidErrorBase {
    // If errorObject isn't suitable to annotate as IFluidErrorBase, bail.
    assert(isRegularObject(errorObject) && !Object.isFrozen(errorObject),
        "Cannot annotate a non-object or frozen error");

    // Patch in any missing properties of IFluidErrorBase
    const fluidErrorBuilder = errorObject as FluidErrorBuilder;
    const errorTypeIfNone = isErrorLike(errorObject)
        ? errorObject.name
        : typeof(errorObject);
    const fluidError = patchFluidErrorBuilder(
        fluidErrorBuilder,
        prepareFluidErrorTemplate(fluidErrorBuilder, errorTypeIfNone, annotations.errorCodeIfNone),
    );

    mixinTelemetryPropsWithFluidError(fluidError, annotations.props);
}

/**
 * Helper type, not exported.
 * Makes IFluidErrorBuilder's props mutable and optional for building one up on an existing object
 */
type FluidErrorBuilder = {
    -readonly [P in keyof IFluidErrorBase]?: IFluidErrorBase[P];
};

/** Returns a template IFluidErrorBase with values based on the inputs provided, for use with patchFluidErrorBuilder */
function prepareFluidErrorTemplate(
    fluidErrorBuilder: FluidErrorBuilder,
    errorTypeIfNone: string,
    errorCodeIfNone: string | undefined,
): IFluidErrorBase {
    const fullErrorTypeIfNone = `none (${errorTypeIfNone})`;
    const fullErrorCodeIfNone = errorCodeIfNone === undefined
        ? "none"
        : `none (${errorCodeIfNone})`;
    return {
        errorType:
            typeof fluidErrorBuilder.errorType === "string"
                ? fluidErrorBuilder.errorType
                : fullErrorTypeIfNone,
        fluidErrorCode:
            typeof fluidErrorBuilder.fluidErrorCode === "string"
                ? fluidErrorBuilder.fluidErrorCode
                : fullErrorCodeIfNone,
        stack:
            typeof fluidErrorBuilder.stack === "string"
                ? undefined // This means don't patch the stack property (since it's already ok)
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

/** Mixin the telemetry props, along with errorType and fluidErrorCode */
function mixinTelemetryPropsWithFluidError(
    error: IFluidErrorBase,
    props?: ITelemetryProperties,
) {
    const { errorType, fluidErrorCode } = error;

    // This is a back-compat move, so old loggers will include errorType and fluidErrorCode via prepareErrorObject
    mixinTelemetryProps(error, { ...props, errorType, fluidErrorCode });
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
