/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidError,
    ITelemetryProperties,
    ISensitiveDebugData,
    isIFluidError,
    ITelemetryBaseEvent,
} from "@fluidframework/common-definitions";

export abstract class FluidError extends Error implements IFluidError {
    public abstract errorType: string;

    private props: ITelemetryProperties = {};
    private debugData: ISensitiveDebugData = {};
    constructor(
        message: string,
        props: ITelemetryProperties = {},
        debugData: ISensitiveDebugData = {},
    ) {
        super(message);
        this.addDetails(props, debugData);
    }

    public getFluidTelemetryProps() { return { ...this.props, message: this.message, errorType: this.errorType }; }
    public getSensitiveDebugData() {
        return { ...this.debugData, stack: this.stack ?? "" };
    } //* Or implement deep copy? Not even possible...?

    public addDetails(props: ITelemetryProperties, debugData: Partial<ISensitiveDebugData>) {
        this.props = { ...this.props, ...props };
        this.debugData = { ...this.debugData, ...debugData };
    }
}

export class GenericError extends FluidError {
    public errorType: string = "generic";
}

export function wrapAsFluidError(err: any): IFluidError {
    if (isIFluidError(err)) {
        return err;
    }

    // WARNING: Exceptions can contain PII!
    // For example, XHR will throw object derived from Error that contains config information
    // for failed request, including all the headers, and thus - user tokens!
    // Extract only call stack, message, and couple network-related properties form error object

    //* start with promoting err's message, per present behavior, and then pull out in later scoped change.
    //* Same with stack above?
    return new GenericError(
        "External Error",
        {},
        { innerError: err },
    );
}

// ///////////////// Demo of usage for Driver Errors ///////////////// //

export enum DriverErrorType {
    throttlingError = "driver.throttlingError",
}

export interface IDriverErrorBase extends IFluidError {
    readonly errorType: DriverErrorType;
    canRetry: boolean;
    online?: string;
}

export interface IThrottlingWarning extends IDriverErrorBase {
    readonly errorType: DriverErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}

export class ThrottlingError extends FluidError implements IThrottlingWarning {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly retryAfterSeconds: number,
        statusCode?: number,
    ) {
        //* As-is, need to include retryAfterSeconds here since we're no longer
        //* just pulling every property off the object but rather keeping them
        //* separated in props. Something to consider.
        super(errorMessage, { retryAfterSeconds, statusCode });
    }
}

// ///////////////// Demo of usage for Container Errors ///////////////// //

export enum ContainerErrorType {
    genericError = "container.genericError",
    throttlingError = "container.throttlingError",
    dataCorruptionError = "container.dataCorruptionError",
}

/**
 * Base interface for all errors and warnings at container level
 */
export interface IErrorBase extends IFluidError {
    /** Sequence number when error happened */
    sequenceNumber?: number;
}

/**
 * Represents errors raised on container.
 */
export type ICriticalContainerError = IErrorBase;

/**
 * Convert the error into one of the error types.
 * @param error - Error to be converted.
 */
export function CreateContainerError(error: any): ICriticalContainerError {
    // assert(error !== undefined);

    const fluidError = wrapAsFluidError(error);
    return fluidError as ICriticalContainerError;
}

// ///////////////// Demo of usage when Logging ///////////////// //

export function prepareErrorObject(event: ITelemetryBaseEvent, error: any, fetchStack: boolean) {
    const fluidError = wrapAsFluidError(error);

    event.stack = fluidError.getSensitiveDebugData().stack;
    event.error = fluidError.message;

    const telemetryProps: ITelemetryProperties = fluidError.getFluidTelemetryProps();
    for (const key of Object.keys(telemetryProps)) {
        if (event[key] === undefined) {
            event[key] = telemetryProps[key];
        }
    }

    // Collect stack if we were not able to extract it from error
    if (event.stack === undefined && fetchStack) {
        //* event.stack = TelemetryLogger.getStack();
    }
}
