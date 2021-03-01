/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WorkerMessage, WorkerExecResult } from "./worker";

const eslint = require("eslint/lib/cli");
export async function lint(message: WorkerMessage): Promise<WorkerExecResult> {
    const oldArgv = process.argv;
    const oldCwd = process.cwd();

    try {
        // TODO: better parsing, assume split delimited for now.
        const argv = message.command.split(" ");

        // Some rules look at process.argv directly and change behaviors
        // (e.g. eslint-plugin-react log some error to console only if format is not set)
        // So just overwrite our argv
        process.argv = [process.argv0, ...argv];
        process.chdir(message.cwd);

        return { code: await eslint.execute(argv) };
    } finally {
        process.argv = oldArgv;
        process.chdir(oldCwd);
    }
}
