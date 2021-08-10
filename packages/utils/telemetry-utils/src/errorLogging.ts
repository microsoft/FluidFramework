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
    isFluidError,
    isValidLegacyError,
} from "./fluidErrorBase";

/** Inspect the given error for common "safe" props and return them */
export function extractLogSafeErrorProperties(error: any) {
    const message = (typeof error?.message === "string")
        ? error.message
        : String(error);

    const stack = (typeof error?.stack === "string")
        ? error.stack
        : undefined;

    return { message, stack };
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
    /** fluidErrorCode to mention if error isn't already an IFluidErrorBase */
    errorCodeIfNone?: string;
}

/**
 * Simplest possible implementation of IFluidErrorBase.
 * Doesn't extend Error and telemetry props are held separate from own properties,
 * in contrast to LoggingError.
 */
class SimpleFluidError implements IFluidErrorBase {
    private readonly addedTelemetryProps: ITelemetryProperties = {};

    readonly errorType: string;
    readonly fluidErrorCode: string;
    readonly message: string;
    readonly stack?: string;
    readonly name?: string;

    constructor(errorProps: Omit<IFluidErrorBase, "getTelemetryProperties" | "addTelemetryProperties">) {
        this.errorType = errorProps.errorType;
        this.fluidErrorCode = errorProps.fluidErrorCode;
        this.message = errorProps.message;
        this.stack = errorProps.stack;
        this.name = errorProps.name;

        this.addTelemetryProperties(errorProps);
    }

    getTelemetryProperties(): ITelemetryProperties {
        return this.addedTelemetryProps;
    }

    addTelemetryProperties(props: ITelemetryProperties) {
        copyProps(this.addedTelemetryProps, props);
    }
}

/** For backwards compatibility with pre-fluidErrorCode valid errors */
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
    annotations: IFluidErrorAnnotations = {},
): IFluidErrorBase {
    // Back-compat, while IFluidErrorBase is rolled out
    if (isValidLegacyError(error)) {
        patchWithErrorCode(error, annotations.errorCodeIfNone);
    }

    if (isFluidError(error)) {
        // We can simply add the telemetry props to the error and return it
        error.addTelemetryProperties(annotations.props ?? {});
        return error;
    }

    // We have to construct a new Fluid Error, copying safe properties over
    const { message, stack } = extractLogSafeErrorProperties(error);
    const fluidError: IFluidErrorBase = new SimpleFluidError({
        errorType: "genericError", // Match Container/Driver generic error type
        fluidErrorCode: annotations.errorCodeIfNone ?? "none",
        message,
        name: hasErrorName(error) ? error.name : undefined,
        stack: stack ?? generateStack(),
    });

    fluidError.addTelemetryProperties({
        ...annotations.props,
        untrustedOrigin: 1, // This will let us filter to errors not originated by our own code
    });

    if (typeof(error) !== "object") {
        // This is only interesting for non-objects
        fluidError.addTelemetryProperties({ typeofError: typeof(error) });
    }
    if (hasErrorType(error)) {
        // We don't think this will ever be logged - but let's be sure because we've made some assumptions about this
        fluidError.addTelemetryProperties({ surpriseErrorType: error.errorType });
    }

    return fluidError;
}

function hasErrorType(error: any): error is { errorType: string | number } {
    return typeof(error?.errorType) === "string" ||
        typeof(error?.errorType) === "number";
}

function hasErrorName(error: any): error is { name: string } {
    return typeof(error?.name) === "string";
}

export function generateStack(): string | undefined {
    // Some browsers will populate stack right away, others require throwing Error
    let stack = new Error("<<generated stack>>").stack;
    if (!stack) {
        try {
            throw new Error("<<generated stack>>");
        } catch (e) {
            stack = e.stack;
        }
    }
    return stack;
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
function getValidTelemetryProps(obj: any, keysToOmit: Set<string>): ITelemetryProperties {
    const props: ITelemetryProperties = {};
    for (const key of Object.keys(obj)) {
        if (keysToOmit.has(key)) {
            continue;
        }
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
 * Base class for "trusted" errors we create, whose properties can generally be logged to telemetry safely.
 * All properties set on the object, or passed in (via the constructor or getTelemetryProperties),
 * will be logged in accordance with their tag, if present.
 *
 * PLEASE take care to avoid setting sensitive data on this object without proper tagging!
 */
export class LoggingError extends Error implements ILoggingError {
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

        // Don't log this list itself either
        omitPropsFromLogging.add("omitPropsFromLogging");

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
        // Include non-enumerable props inherited from Error that are not returned by getValidTelemetryProps
        return  {
            ...taggableProps,
            stack: this.stack,
            message: this.message,
        };
    }
}
