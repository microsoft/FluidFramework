/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import chalk from "chalk";

/**
 * Contains simple console logging utilities used by the package.
 */

/**
 * Logs an error message to the console in red, prefixed with "ERROR: ".
 * @internal
 */
export function logError(message: string): void {
    console.log(chalk.red(`ERROR: ${message}`));
}

/**
 * Logs a "success" message to the console in green, prefixed with "SUCCESS: ".
 * @internal
 */
export function logSuccess(message: string): void {
    console.log(chalk.green(`SUCCESS: ${message}`));
}

/**
 * Logs a warning message to the console in yellow, prefixed with "WARNING: ".
 * @internal
 */
export function logWarning(message: string): void {
    console.log(chalk.yellow(`WARNING: ${message}`));
}
