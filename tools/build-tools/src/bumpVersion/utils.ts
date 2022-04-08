/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { execAsync } from "../common/utils";
import * as semver from "semver";

export function fatal(error: string): never {
    const e = new Error(error);
    (e as any).fatal = true;
    throw e;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function exec(cmd: string, dir: string, error: string, pipeStdIn?: string) {
    const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
    if (result.error) {
        fatal(`ERROR: Unable to ${error}\nERROR: error during command ${cmd}\nERROR: ${result.error.message}`);
    }
    return result.stdout;
}

/**
 * Execute a command. If there is an error, print error message and exit process
 *
 * @param cmd Command line to execute
 * @param dir dir the directory to execute on
 * @param error description of command line to print when error happens
 */
export async function execNoError(cmd: string, dir: string, pipeStdIn?: string) {
    const result = await execAsync(cmd, { cwd: dir }, pipeStdIn);
    if (result.error) {
        return undefined;
    }
    return result.stdout;
}

export function prereleaseSatisfies(packageVersion: string, range: string) {
    // Pretend that the current package is latest prerelease (zzz) and see if the version still satisfies.
    return semver.satisfies(`${packageVersion}-zzz`, range)
}
