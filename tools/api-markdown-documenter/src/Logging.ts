/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";

/**
 * Function signature for logging a message or error.
 *
 * @public
 */
export type LoggingFunction = (message: string | Error, ...parameters: unknown[]) => void;

/**
 * A logger for use with the system.
 *
 * @public
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

function noop(): void {}

/**
 * Default logger, configured to log to the console.
 *
 * @public
 */
export const defaultConsoleLogger: Logger = {
	info: console.log,
	warning: logWarningToConsole,
	error: logErrorToConsole,
	success: logSuccessToConsole,
	verbose: noop,
};

/**
 * Verbose logger, configured to log to the console.
 *
 * @public
 */
export const verboseConsoleLogger: Logger = {
	...defaultConsoleLogger,
	verbose: console.log,
};

/**
 * Logs a warning message to the console in yellow, prefixed with "WARNING: ".
 */
function logWarningToConsole(message: string | Error, ...parameters: unknown[]): void {
	console.log(`${chalk.yellow(`WARNING`)}: ${message}`, ...parameters);
}

/**
 * Logs an error message to the console in red, prefixed with "ERROR: ".
 */
function logErrorToConsole(message: string | Error, ...parameters: unknown[]): void {
	console.log(`${chalk.red(`ERROR`)}: ${message}`, ...parameters);
}

/**
 * Logs a "success" message to the console in green, prefixed with "SUCCESS: ".
 */
function logSuccessToConsole(message: string | Error, ...parameters: unknown[]): void {
	console.log(`${chalk.green(`SUCCESS`)}: ${message}`, ...parameters);
}
