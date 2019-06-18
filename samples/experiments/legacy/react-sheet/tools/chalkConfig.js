/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// Centralized configuration for chalk, which is used to add color to console.log statements.
import chalk from 'chalk';
export const chalkError = chalk.red;
export const chalkSuccess = chalk.green;
export const chalkWarning = chalk.yellow;
export const chalkProcessing = chalk.blue;
