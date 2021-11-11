/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

let shouldLog = false;
export function enableLogging(enable: boolean) {
    shouldLog = enable;
}

export function log(output: string) {
    if (shouldLog) {
        console.log(output);
    }
}