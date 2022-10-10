/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import chalk from "chalk";

/**
 * Function signature for logging a message or error.
 */
export type LoggingFunction = (message: string | Error, ...args: unknown[]) => void;

/**
 * A logger for use with the system.
 */
export interface Logger {
    /**
     * Default logging function.
     */
    info: LoggingFunction;

    /**
     * Logs a `warning`.
     */
    warning: LoggingFunction;

    /**
     * Logs an `error.`
     */
    error: LoggingFunction;

    /**
     * Logs a `success` condition.
     */
    success: LoggingFunction;

    /**
     * Logs a `verbose` message.
     * If verbose logging is not wanted, this may no-op.
     */
    verbose: LoggingFunction;
}

/**
 * Default logger, configured to log to the console.
 */
export const defaultConsoleLogger: Logger = {
    info: console.log,
    warning: logWarningToConsole,
    error: logErrorToConsole,
    success: logSuccessToConsole,
    verbose: () => {
        /* no-op */
    },
};

/**
 * Verbose logger, configured to log to the console.
 */
export const verboseConsoleLogger: Logger = {
    ...defaultConsoleLogger,
    verbose: console.log,
};

/**
 * Logs a warning message to the console in yellow, prefixed with "WARNING: ".
 */
function logWarningToConsole(message: string | Error): void {
    console.log(`${chalk.yellow(`WARNING`)}: ${message}`);
}

/**
 * Logs an error message to the console in red, prefixed with "ERROR: ".
 */
function logErrorToConsole(message: string | Error): void {
    console.log(`${chalk.red(`ERROR`)}: ${message}`);
}

/**
 * Logs a "success" message to the console in green, prefixed with "SUCCESS: ".
 */
function logSuccessToConsole(message: string | Error): void {
    console.log(`${chalk.green(`WARNING`)}: ${message}`);
}
