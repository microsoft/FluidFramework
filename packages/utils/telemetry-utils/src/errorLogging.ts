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
} from "./staging";
import {
    mixinTelemetryProps,
    copyProps,
} from "./errorLoggingInternalHelpers";

/** @returns true if value is an object but neither null nor an array */
export const isRegularObject = (value: any): boolean => {
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

/** Metadata to annotate an error object when annotating or normalizing it */
export interface FluidErrorAnnotations {
    /** Telemetry props to log with the error */
    props?: ITelemetryProperties;
    /** fluidErrorCode to mention if error isn't already an IFluidErrorBase */
    errorCodeIfNone?: string;
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
        errorType: "nohne",
        fluidErrorCode: annotations.errorCodeIfNone ?? "none",
        message,
        stack: stack ?? generateStack(),
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
