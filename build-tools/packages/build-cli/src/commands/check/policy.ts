/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { EOL as newline } from "os";
// eslint-disable-next-line camelcase
import * as child_process from "child_process";
// eslint-disable-next-line unicorn/import-style
import * as path from "path";
import { Flags } from "@oclif/core";
import {
    copyrightFileHeaderHandlers,
    npmPackageContentsHandlers,
    dockerfilePackageHandler,
    fluidCaseHandler,
    lockfilesHandlers,
    assertShortCodeHandler,
    Handler,
    exclusions,
} from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";

const readPipe: () => Promise<string | undefined> = async () => {
    return new Promise((resolve) => {
        const stdin = process.openStdin();
        stdin.setEncoding("utf-8");

        let data = "";
        stdin.on("data", (chunk) => {
            data += chunk;
        });

        stdin.on("end", () => {
            resolve(data);
        });

        if (stdin.isTTY) {
            resolve("");
        }
    });
};

export class CheckPolicy extends BaseCommand<typeof CheckPolicy.flags> {
    static description =
        "Checks that the dependencies between Fluid Framework packages are properly layered.";

    static flags = {
        resolve: Flags.string({
            description: `Resolve errors if possible`,
            required: false,
            char: "h",
        }),
        handler: Flags.string({
            description: `Filter handler names by <regex>`,
            required: false,
            char: "h",
        }),
        path: Flags.string({
            description: `Filter file paths by <regex>`,
            required: false,
            char: "p",
        }),
        stdin: Flags.string({
            description: `Get file from stdin`,
            required: false,
            char: "s",
        }),
        ...BaseCommand.flags,
    };

    async run() {
        const { flags } = await this.parse(CheckPolicy);
        const exclusionsRegex: RegExp[] = exclusions.map((e: string) => new RegExp(e, "i"));
        const handlerRegex =
            typeof flags.handler === "string" ? new RegExp(flags.handler, "i") : /.?/;
        const pathRegex = typeof flags.path === "string" ? new RegExp(flags.path, "i") : /.?/;
        let pathToGitRoot = "";
        let count = 0;
        let processed = 0;

        /**
         * declared file handlers
         */
        const handlers: Handler[] = [
            ...copyrightFileHeaderHandlers,
            ...npmPackageContentsHandlers,
            dockerfilePackageHandler,
            fluidCaseHandler,
            ...lockfilesHandlers,
            assertShortCodeHandler,
        ];
        const handlerActionPerf = new Map<"handle" | "resolve" | "final", Map<string, number>>();

        const runWithPerf = <T>(
            name: string,
            action: "handle" | "resolve" | "final",
            run: () => T,
        ): T => {
            const actionMap = handlerActionPerf.get(action) ?? new Map<string, number>();
            let dur = actionMap.get(name) ?? 0;

            const start = Date.now();
            const result = run();
            dur += Date.now() - start;

            actionMap.set(name, dur);
            handlerActionPerf.set(action, actionMap);
            return result;
        };

        // route files to their handlers by regex testing their full paths
        // synchronize output, exit code, and resolve decision for all handlers
        const routeToHandlers = (file: string) => {
            handlers
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                .filter((handler) => handler.match.test(file) && handlerRegex.test(handler.name))
                // eslint-disable-next-line array-callback-return
                .map((handler) => {
                    const result = runWithPerf(handler.name, "handle", () =>
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        handler.handler(file, pathToGitRoot),
                    );
                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                    if (result) {
                        let output = `${newline}file failed policy check: ${file}${newline}${result}`;
                        const resolver = handler.resolver;
                        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                        if (flags.resolve && resolver) {
                            output += `${newline}attempting to resolve: ${file}`;
                            const resolveResult = runWithPerf(handler.name, "resolve", () =>
                                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                                resolver(file, pathToGitRoot),
                            );

                            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                            if (resolveResult.message) {
                                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                                output += newline + resolveResult.message;
                            }

                            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                            if (!resolveResult.resolved) {
                                this.exit(1);
                            }
                        } else {
                            this.exit(1);
                        }

                        console.log(output);
                    }
                });
        };

        const handleLine = (line: string) => {
            const filePath = path.join(pathToGitRoot, line).trim().replace(/\\/g, "/");

            if (pathRegex.test(line) && fs.existsSync(filePath)) {
                count++;
                if (exclusionsRegex.every((value) => !value.test(line))) {
                    routeToHandlers(filePath);
                    processed++;
                } else {
                    this.log(`Excluded: ${line}`);
                }
            }
        };

        const runPolicyCheck = () => {
            for (const h of handlers) {
                const final = h.final;
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (final) {
                    const result = runWithPerf(h.name, "final", () =>
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                        final(pathToGitRoot, flags.resolve),
                    );
                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                    if (result?.error) {
                        process.exitCode = 1;
                        console.log(result.error);
                    }
                }
            }
        };

        const logStats = () => {
            this.log(
                `Statistics: ${processed} processed, ${count - processed} excluded, ${count} total`,
            );
            for (const [action, handlerPerf] of handlerActionPerf.entries()) {
                this.log(`Performance for "${action}":`);
                for (const [handler, dur] of handlerPerf.entries()) {
                    this.log(`\t${handler}: ${dur / 1000}:`);
                }
            }
        };

        if (flags.resolve !== undefined) {
            this.log("Resolving errors if possible.");
        }

        if (flags.handler !== undefined) {
            this.log(`Filtering handlers by regex: ${handlerRegex}`);
        }

        if (flags.path !== undefined) {
            this.log(`Filtering file paths by regex: ${pathRegex}`);
        }

        if (typeof flags.stdin === "string") {
            // prepare to read standard input line by line
            process.stdin.setEncoding("utf8");
            const pipeString = await readPipe();

            if (typeof pipeString === "string") {
                this.log(pipeString);
                // for each run handleLine
            } else {
                this.log(pipeString);
            }
        } else {
            // eslint-disable-next-line camelcase
            pathToGitRoot = child_process
                .execSync("git rev-parse --show-cdup", { encoding: "utf8" })
                .trim();
            // eslint-disable-next-line camelcase
            const p = child_process.spawn("git", [
                "ls-files",
                "-co",
                "--exclude-standard",
                "--full-name",
            ]);
            const pipeString = await readPipe();

            if (typeof pipeString === "string") {
                this.log(pipeString);
                // for each run handleLine
            } else {
                this.log(pipeString);
            }
        }

        runPolicyCheck();
        logStats();
    }
}
