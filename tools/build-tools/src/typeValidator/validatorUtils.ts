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

export enum BreakingIncrement {
    none = 0,
    minor = 1,
    major = minor << 1 | minor, // this makes comparisons easier
};

export interface IValidator {
    validate(project: Project, pkgDir: string) : BreakingIncrement;
}
