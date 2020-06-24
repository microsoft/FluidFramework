/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 */

export type ErrorType = string;

export enum ContainerErrorType {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    genericError = "genericError",

    /**
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    throttlingError = "throttlingError",
}

export enum RuntimeErrorType {
    /**
     * Some error, most likely an exception caught by runtime and propagated to container as critical error
     */
    genericError = "genericError",

    /**
     * Summarizing error. Currently raised on summarizing container only.
     * Work is planned to propagate these errors to main container.
     */
    summarizingError = "summarizingError",

    /**
     * Throttling error from server. Server is busy and is asking not to reconnect for some time
     */
    throttlingError = "throttlingError",

    /*
     * The data is corrupted. This indicates a critical error caused by storage.
     */
    dataCorruptionError = "dataCorruptionError",
}

/**
 * Container error type, raises via "closed" handler on Container class.
 * Given that container errors is union of internal container errors, runtime errors and driver errors,
 * type definition is not exhaustive nor concrete, as dynamic nature of drivers & runtimes leaves
 * us with overall structure, but no ability to enumerate all types of errors.
*/
export type CriticalContainerError =  IErrorBase;

/**
 * List of warnings raised on container that are not critical.
 * Hosts may want to expose them in some form to users, or may skip.
 */
export type ContainerWarning =
    | IThrottlingWarning
    | ISummarizingWarning;

/**
 * Base interface for all errors and warnings
 */
export interface IErrorBase {
    readonly errorType: ErrorType;
    readonly message: string;
    /** Sequence number when error happened */
    sequenceNumber?: number;
}

export interface IGenericError extends IErrorBase {
    readonly errorType: ContainerErrorType.genericError;
    error?: any;
}

export interface IThrottlingWarning extends IErrorBase {
    readonly errorType: ContainerErrorType.throttlingError;
    readonly retryAfterSeconds: number;
}

export interface ISummarizingWarning extends IErrorBase {
    readonly errorType: RuntimeErrorType.summarizingError;
    /**
     * Whether this error has already been logged. Used to avoid logging errors twice.
     */
    readonly logged: boolean;
}

export interface IDataCorruptionError extends IErrorBase {
    readonly errorType: RuntimeErrorType.dataCorruptionError;
}
