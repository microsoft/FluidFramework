/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Project } from "ts-morph";

let shouldLog = false;
export function enableLogging(enable: boolean) {
    shouldLog = enable;
}

export function log(output: any) {
    if (shouldLog) {
        console.log(output);
    }
}

/**
 * This uses the bit shifts instead of incrementing because it allows us to OR the
 * results of multiple checks together to get the largest breaking increment at the
 * end without needing to do any max(x,y) checks
 */
export enum BreakingIncrement {
    none = 0,
    minor = 1,
    major = minor << 1 | minor,
};

export interface IValidator {
    validate(project: Project, pkgDir: string) : BreakingIncrement;
}
