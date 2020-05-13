/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import { commonOptions } from "./commonOptions";

export function logVerbose(msg: string) {
    if (commonOptions.verbose) {
        logStatus(msg);
    }
}

export function logStatus(msg: string) {
    if (!commonOptions.logtime) {
        console.log(msg);
        return;
    }
    const date = new Date();
    let hours = date.getHours().toString();
    if (hours.length === 1) { hours = '0' + hours; }
    let mins = date.getMinutes().toString();
    if (mins.length === 1) { mins = '0' + mins; }
    let secs = date.getSeconds().toString();
    if (secs.length === 1) { secs = '0' + secs; }
    console.log(chalk.default.yellow(`[${hours}:${mins}:${secs}] `) + msg);
}
