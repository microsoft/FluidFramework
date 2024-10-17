/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Project } from "ts-morph";

let shouldLog = false;
export function enableLogging(enable: boolean): void {
	shouldLog = enable;
}

export function log(output: unknown): void {
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
	// eslint-disable-next-line no-bitwise
	major = (minor << 1) | minor,
}

export interface IValidator {
	/**
	 * Validate the internal state.  May mutate state and is only valid to call once
	 * @param project - The Project which may be used to run a ts compilation task
	 * @param pkgDir - The dir for the Project which may be used to create temporary
	 * source files
	 */
	validate(project: Project, pkgDir: string): BreakingIncrement;
}
