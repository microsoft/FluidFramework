/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import chalk from "chalk";

import { commonOptions } from "./commonOptions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ErrorLoggingFunction = (msg: string | Error | undefined, ...args: any[]) => void;

export type LoggingFunction = (message?: string, ...args: any[]) => void;

export interface Logger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: LoggingFunction;
    info: ErrorLoggingFunction;
    warning: ErrorLoggingFunction;
    errorLog: ErrorLoggingFunction;
    verbose: ErrorLoggingFunction;
}

export const defaultLogger: Logger = {
    log: console.log,
    info,
    warning,
    errorLog,
    verbose,
};

function log(msg: string | Error | undefined, logFunc: ErrorLoggingFunction) {
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

function info(msg: string | Error | undefined) {
    log(`INFO: ${msg}`, console.log);
}

function verbose(msg: string | Error | undefined) {
    if (commonOptions.verbose) {
        log(msg, console.log);
    }
}

function warning(msg: string | Error | undefined) {
    log(`${chalk.yellow(`WARNING`)}: ${msg}`, console.log);
}

function errorLog(msg: string | Error | undefined) {
    log(`${chalk.red(`ERROR`)}: ${msg}`, console.error);
}
