/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable unicorn/prefer-module */
/* eslint-disable import/no-internal-modules */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable unicorn/import-style */
/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/promise-function-async */
/* eslint-disable array-callback-return */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import * as fs from "fs";
import { EOL as newline } from "os";
import * as child_process from "child_process";
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
} from "@fluidframework/build-tools";
import { BaseCommand } from "../../base";

const readStdin: () => Promise<string | undefined> = () => {
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
        "Checks that the dependencies between Fluid Framework packages are following policies.";

    static flags = {
        fix: Flags.boolean({
            description: `Fix errors if possible`,
            required: false,
            char: "f",
        }),
        handler: Flags.string({
            description: `Filter handler names by <regex>`,
            required: false,
            char: "d",
        }),
        path: Flags.string({
            description: `Filter file paths by <regex>`,
            required: false,
            char: "p",
        }),
        exclusions: Flags.string({
            description: `Filter exclusions path`,
            required: false,
            char: "e",
            default: "exclusions.json"
        }),
        stdin: Flags.boolean({
            description: `Get file from stdin`,
            required: false,
        }),
        ...BaseCommand.flags,
    };

    async run() {
        const flags = this.processedFlags;
        const exclusions: RegExp[] = require(`../../data/${flags.exclusions}`).map(
            (e: string) => new RegExp(e, "i"),
        );
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
                .filter((handler) => handler.match.test(file) && handlerRegex.test(handler.name))
                .map((handler) => {
                    const result = runWithPerf(handler.name, "handle", () =>
                        handler.handler(file, pathToGitRoot),
                    );
                    if (result) {
                        let output = `${newline}file failed policy check: ${file}${newline}${result}`;
                        const resolver = handler.resolver;
                        if (flags.resolve && resolver) {
                            output += `${newline}attempting to resolve: ${file}`;
                            const resolveResult = runWithPerf(handler.name, "resolve", () =>
                                resolver(file, pathToGitRoot),
                            );

                            if (resolveResult.message) {
                                output += newline + resolveResult.message;
                            }

                            if (!resolveResult.resolved) {
                                this.exit(1);
                            }
                        } else {
                            this.exit(1);
                        }

                        this.log(output);
                    }
                });
        };

        const handleLine = (line: string) => {
            const filePath = path.join(pathToGitRoot, line).trim().replace(/\\/g, "/");

            if (pathRegex.test(line) && fs.existsSync(filePath)) {
                count++;
                if (exclusions.every((value) => !value.test(line))) {
                    try {
                        routeToHandlers(filePath);
                    } finally {
                        runPolicyCheck();
                        logStats();
                    }

                    processed++;
                } else {
                    this.log(`Excluded: ${line}`);
                }
            }
        };

        const runPolicyCheck = () => {
            for (const h of handlers) {
                const final = h.final;
                if (final) {
                    const result = runWithPerf(h.name, "final", () =>
                        final(pathToGitRoot, flags.resolve),
                    );
                    if (result?.error) {
                        this.exit(1);
                        this.log(result.error);
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

        if (flags.resolve) {
            this.log("Resolving errors if possible.");
        }

        if (flags.handler !== undefined) {
            this.log(`Filtering handlers by regex: ${handlerRegex}`);
        }

        if (flags.path !== undefined) {
            this.log(`Filtering file paths by regex: ${pathRegex}`);
        }

        if (flags.stdin) {
            const pipeString = await readStdin();

            if (pipeString) {
                pipeString.split("\n").map((line: string) => handleLine(line));
                return;
            }

            runPolicyCheck();
            logStats();
            return;
        }

        pathToGitRoot = child_process
            .execSync("git rev-parse --show-cdup", { encoding: "utf8" })
            .trim();
        const p = child_process.spawn("git", [
            "ls-files",
            "-co",
            "--exclude-standard",
            "--full-name",
        ]);
        let scriptOutput = "";
        p.stdout.on("data", (data) => {
            scriptOutput = `${scriptOutput}${data.toString()}`;
        });
        p.stdout.on("close", () => {
            scriptOutput.split("\n").map((line: string) => handleLine(line));
        });
    }
}
