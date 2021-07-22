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
import {
    extractLogSafeErrorProperties,
    isRegularObject,
    mixinTelemetryProps,
    copyProps,
} from "./internalHelpers";

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
 * Normalize the given error object yielding a valid Fluid Error
 * @returns The same error object passed in if possible, normalized and with any provided annotations applied
 * @param error - The error to normalize, ideally by patching in the properties of IFluidErrorBase
 * @param annotations - Annotations to apply to the normalized error:
 * annotations.props - telemetry props to log with the error
 * annotations.errorCodeIfNone - fluidErrorCode to mention if error isn't already an IFluidErrorBase
 * @param strict - If true, then throw if the given error can't be patched. Otherwise, create and return a new object
 */
 export function normalizeError(
    error: unknown,
    annotations: {
        props?: ITelemetryProperties,
        errorCodeIfNone?: string,
    } = {},
    strict: boolean = false,
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
        assert(!strict, "normalizeError cannot patch the given non-object or frozen error (strict: true)");

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

/**
 * Helper type, not exported.
 * Makes IFluidErrorBuilder's props mutable and optional for building one up on an existing object
 */
 type FluidErrorBuilder = {
    -readonly [P in keyof IFluidErrorBase]?: IFluidErrorBase[P];
};

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
function mixinTelemetryPropsWithFluidError(error: IFluidErrorBase, props?: ITelemetryProperties) {
    const { errorType, fluidErrorCode } = error;

    // This is a back-compat move, so old loggers will include errorType and fluidErrorCode via prepareErrorObject
    return mixinTelemetryProps(error, { ...props, errorType, fluidErrorCode });
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
