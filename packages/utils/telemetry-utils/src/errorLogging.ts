/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ILoggingError,
    ITaggedTelemetryPropertyType,
    ITelemetryProperties,
} from "@fluidframework/common-definitions";
import {
    IFluidErrorBase,
    isILoggingError,
    isFluidError,
    isValidLegacyError,
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

//* tsdoc
function patchWithErrorCode(
    legacyError: Omit<IFluidErrorBase, "fluidErrorCode">,
    errorCode: string = "<error predates fluidErrorCode>",
): asserts legacyError is IFluidErrorBase {
    const patchMe: { fluidErrorCode?: string } = legacyError as any;
    if (patchMe.fluidErrorCode === undefined) {
        patchMe.fluidErrorCode = errorCode;
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
    annotations: FluidErrorAnnotations = {},
): IFluidErrorBase {
    // Back-compat, while IFluidErrorBase is rolled out
    if (isValidLegacyError(error)) {
        patchWithErrorCode(error, annotations.errorCodeIfNone);
    }

    if (isFluidError(error)) {
        // We can simply annotate the error and return it
        mixinTelemetryPropsWithFluidError(error, annotations.props);
        return error;
    }

    // We have to construct a new fluid error, copying safe properties over
    const { message, stack } = extractLogSafeErrorProperties(error);
    const fluidError: IFluidErrorBase = {
        errorType: "",
        fluidErrorCode: annotations.errorCodeIfNone ?? "none",
        message,
        stack: stack ?? new Error("<<generated stack>>").stack,
    };

    mixinTelemetryPropsWithFluidError(fluidError, {
        ...annotations.props,
        untrustedOrigin: true, // This will let us filter to errors not originated by our own code
        typeofError: typeof(error) === "object" ? undefined : typeof(error), // Only interesting for non-objects
    });
    return fluidError;
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
 * @deprecated - Use normalizeError instead
 * Annotate the given error object with the given logging props
 * @returns The same error object passed in if possible, with telemetry props functionality mixed in
 */
 export function annotateError(
    error: unknown,
    props: ITelemetryProperties,
): ILoggingError {
    if (isRegularObject(error)) {
        mixinTelemetryProps(error, props);
        return error;
    }

    const message = String(error);
    return new LoggingError(message, props);
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
