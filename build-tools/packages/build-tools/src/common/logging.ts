/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import { commonOptions } from "./commonOptions";

export type LoggingFunction = (msg: string | Error, ...args: unknown[]) => void;

export interface Logger {
    info: LoggingFunction,
    warning: LoggingFunction,
    errorLog: LoggingFunction,
    verbose: LoggingFunction,
}

export const defaultLogger: Logger = {
    info,
    warning,
    errorLog,
    verbose
}

function verbose(msg: string | Error) {
    if (commonOptions.verbose) {
        info(msg);
    }
}

function log(msg: string | Error, logFunc: LoggingFunction) {
    if (!commonOptions.logtime) {
        logFunc(msg);
        return;
    }
    const date = new Date();
    let hours = date.getHours().toString();
    if (hours.length === 1) { hours = '0' + hours; }
    let mins = date.getMinutes().toString();
    if (mins.length === 1) { mins = '0' + mins; }
    let secs = date.getSeconds().toString();
    if (secs.length === 1) { secs = '0' + secs; }
    logFunc(chalk.yellow(`[${hours}:${mins}:${secs}] `) + msg);
}

function info(msg: string | Error) {
    log(msg, console.log);
}

function warning(msg: string | Error) {
    log(`${chalk.yellow(`WARNING`)}: ${msg}`, console.log);
}

function errorLog(msg: string | Error) {
    log(`${chalk.red(`ERROR`)}: ${msg}`, console.error);
}
