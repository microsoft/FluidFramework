/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "picocolors";

import { commonOptions } from "../fluidBuild/commonOptions";

/**
 * A function that logs an Error or error message.
 */
export type ErrorLoggingFunction = (
	msg: string | Error,
	...args: any[]
) => string | Error | void;

/**
 * A function that logs an error message.
 */
export type LoggingFunction = (message: string, ...args: any[]) => string | void;

/**
 * A general-purpose logger object.
 *
 * @remarks
 *
 * The `log` method is the primary logging function. The other functions can be used to support logging at different
 * levels. Methods other than `log` may modify the error message in some way (e.g. by prepending some text to it).
 */
export interface Logger {
	/**
	 * Logs an error message as-is.
	 */
	log: LoggingFunction;

	/**
	 * Logs an informational message.
	 */
	info: ErrorLoggingFunction;

	/**
	 * Logs a warning message.
	 */
	warning: ErrorLoggingFunction;

	/**
	 * Logs an error message.
	 *
	 * @remarks
	 *
	 * This method is not named 'error' because it conflicts with the method that oclif has on its Command class.
	 * That method exits the process in addition to logging, so this method exists to differentiate, and provide
	 * error logging that doesn't exit the process.
	 */
	errorLog: ErrorLoggingFunction;

	/**
	 * Logs a verbose message.
	 */
	verbose: ErrorLoggingFunction;
}

/**
 * A {@link Logger} that logs directly to the console.
 */
export const defaultLogger: Logger = {
	/**
	 * {@inheritDoc Logger.log}
	 */
	log,

	/**
	 * {@inheritDoc Logger.info}
	 */
	info,

	/**
	 * {@inheritDoc Logger.warning}
	 */
	warning,

	/**
	 * {@inheritDoc Logger.errorLog}
	 */
	errorLog,

	/**
	 * {@inheritDoc Logger.verbose}
	 */
	verbose,
};

function logWithTime(msg: string | Error, logFunc: ErrorLoggingFunction) {
	if (!commonOptions.logtime) {
		logFunc(msg);
		return;
	}
	const date = new Date();
	let hours = date.getHours().toString();
	if (hours.length === 1) {
		hours = "0" + hours;
	}
	let mins = date.getMinutes().toString();
	if (mins.length === 1) {
		mins = "0" + mins;
	}
	let secs = date.getSeconds().toString();
	if (secs.length === 1) {
		secs = "0" + secs;
	}
	logFunc(chalk.yellow(`[${hours}:${mins}:${secs}] `) + msg);
}

function log(msg: string): string {
	if (!commonOptions.quiet) {
		logWithTime(msg, console.log);
	}
	return msg;
}

function info(msg: string | Error): string | Error {
	if (!commonOptions.quiet) {
		logWithTime(`INFO: ${msg}`, console.log);
	}
	return msg;
}

function verbose(msg: string | Error): string | Error {
	if (!commonOptions.quiet && commonOptions.verbose) {
		logWithTime(`VERBOSE: ${msg}`, console.log);
	}
	return msg;
}

function warning(msg: string | Error): string | Error {
	logWithTime(`${chalk.yellow(`WARNING`)}: ${msg}`, console.log);
	return msg;
}

function errorLog(msg: string | Error): string | Error {
	logWithTime(`${chalk.red(`ERROR`)}: ${msg}`, console.error);
	return msg;
}
