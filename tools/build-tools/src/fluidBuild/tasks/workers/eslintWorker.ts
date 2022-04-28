/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WorkerMessage, WorkerExecResult } from "./worker";

export async function lint(message: WorkerMessage): Promise<WorkerExecResult> {
    const oldArgv = process.argv;
    const oldCwd = process.cwd();
    try {
        // Load the eslint version that is in the cwd scope
        const eslintPath = require.resolve("eslint", { paths: [message.cwd] });
        const eslint = require(eslintPath);

        // TODO: better parsing, assume split delimited for now.
        const argv = message.command.split(" ");

        // Some rules look at process.argv directly and change behaviors
        // (e.g. eslint-plugin-react log some error to console only if format is not set)
        // So just overwrite our argv
        process.argv = [process.argv0, eslintPath, ...argv.slice(1)];
        process.chdir(message.cwd);

        // assume "eslint --format stylish src"
        const engine = new eslint.ESLint();
        const results = await engine.lintFiles("src");
        let formatter;
        try {
            formatter = await engine.loadFormatter("stylish");
        } catch (e: any) {
            console.error(e.message);
            return { code: 2 };
        }

        const output = await formatter.format(results);

        if (output) {
            console.info(output);
        }
        let code = 0;
        for (const result of results) {
            code += result.errorCount;
        }
        return { code };
    } finally {
        process.argv = oldArgv;
        process.chdir(oldCwd);
    }
}
