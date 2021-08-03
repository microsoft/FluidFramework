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

/** type guard for ILoggingError interface */
export const isILoggingError = (x: any): x is ILoggingError => typeof x?.getTelemetryProperties === "function";

/** Copy props from source onto target, overwriting any keys that are already set on target */
function copyProps(target: unknown, source: ITelemetryProperties) {
    Object.assign(target, source);
}

/** Metadata to annotate an error object when annotating or normalizing it */
export interface IFluidErrorAnnotations {
    /** Telemetry props to log with the error */
    props?: ITelemetryProperties;
    /** fluidErrorCode to mention if error isn't already an IFluidErrorBase */
    errorCodeIfNone?: string;
}

/** Simplest possible implementation of IFluidErrorBase */
class SimpleFluidError implements IFluidErrorBase {
    private readonly telemetryProps: ITelemetryProperties = {};

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
    }

    getTelemetryProperties(): ITelemetryProperties {
        const props: ITelemetryProperties = {
            ...this.telemetryProps,
            errorType: this.errorType,
            fluidErrorCode: this.fluidErrorCode,
            message: this.message,
        };
        if (this.name !== undefined) {
            props.name = this.name;
        }
        if (this.stack !== undefined) {
            props.stack = this.stack;
        }
        return props;
    }

    addTelemetryProperties(props: ITelemetryProperties) {
        copyProps(this.telemetryProps, props);
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
    const { message, stack } = extractLogSafeErrorProperties(error, false /* sanitizeStack */);
    const fluidError: IFluidErrorBase = new SimpleFluidError({
        errorType: "genericError", // Match Container/Driver generic error type
        fluidErrorCode: annotations.errorCodeIfNone ?? "none",
        message,
        stack: stack ?? generateStack(),
    });

    fluidError.addTelemetryProperties({
        ...annotations.props,
        untrustedOrigin: true, // This will let us filter to errors not originated by our own code
    });

    if (typeof(error) !== "object") {
        // This is only interesting for non-objects
        fluidError.addTelemetryProperties({ typeofError: typeof(error) });
    }
    return fluidError;
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
export function getValidTelemetryProps(obj: any, keysToOmit: Set<string>): ITelemetryProperties {
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
        // Include non-enumerable props inherited from Error that would not be returned by getValidTelemetryProps
        // But if any were overwritten (e.g. with a tagged property), then use the result from getValidTelemetryProps.
        // Not including the 'name' property because if not overridden it's always "Error"
        return  {
            stack: this.stack,
            message: this.message,
            ...taggableProps,
        };
    }
}
