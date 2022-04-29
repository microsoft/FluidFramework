/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "@fluidframework/common-definitions";

/**
 * All normalized errors flowing through the Fluid Framework adhere to this readonly interface.
 * It features errorType and errorInstanceId on top of Error's members as readonly,
 * and a getter/setter for telemetry props to be included when the error is logged.
 */
export interface IFluidErrorBase extends Error {
    /** Classification of what type of error this is, used programmatically by consumers to interpret the error */
    readonly errorType: string;

    /**
     * Error's message property, made readonly.
     * Be specific, but also take care when including variable data to consider suitability for aggregation in telemetry
     * Also avoid including any data that jeopardizes the user's privacy.  Add a tagged telemetry property instead.
     */
    readonly message: string;

    /** Error's stack property, made readonly */
    readonly stack?: string;

    /** Error's name property, made readonly */
    readonly name: string;

    /**
     * A Guid identifying this error instance.
     * Useful in telemetry for deduping multiple logging events arising from the same error,
     * or correlating an error with an inner error that caused it, in case of error wrapping.
     */
    readonly errorInstanceId: string;

    /** Get the telemetry properties stashed on this error for logging */
    getTelemetryProperties(): ITelemetryProperties;
    /** Add telemetry properties to this error which will be logged with the error */
    addTelemetryProperties: (props: ITelemetryProperties) => void;
}

const hasTelemetryPropFunctions = (x: any): boolean =>
    typeof x?.getTelemetryProperties === "function" &&
    typeof x?.addTelemetryProperties === "function";

export const hasErrorInstanceId = (x: any): x is { errorInstanceId: string } =>
    typeof x?.errorInstanceId === "string";

/** type guard for IFluidErrorBase interface */
export function isFluidError(e: any): e is IFluidErrorBase {
    return typeof e?.errorType === "string" &&
        typeof e?.message === "string" &&
        hasErrorInstanceId(e) &&
        hasTelemetryPropFunctions(e);
}

/** type guard for old standard of valid/known errors */
export function isValidLegacyError(e: any): e is Omit<IFluidErrorBase, "errorInstanceId"> {
    return typeof e?.errorType === "string" &&
        typeof e?.message === "string" &&
        hasTelemetryPropFunctions(e);
}
