/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ILoggingError, ITelemetryProperties } from "@fluidframework/common-definitions";
import { isILoggingError } from "./staging";
import { LoggingError } from "./errorLogging";

// ///////////////////////////////////////////////////////////////////////// //
//               This code is not exported outside this package              //
// ///////////////////////////////////////////////////////////////////////// //

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

/** Copy props from source onto target, overwriting any keys that are already set on target */
export function copyProps(target: unknown, source: ITelemetryProperties) {
    Object.assign(target, source);
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
