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
    /**
     * Validate the internal state.  May mutate state and is only valid to call once
     * @param project - The Project which may be used to run a ts compilation task
     * @param pkgDir - The dir for the Project which may be used to create temporary
     *      source files
     */
    validate(project: Project, pkgDir: string) : BreakingIncrement;
}
