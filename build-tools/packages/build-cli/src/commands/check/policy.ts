/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";
import * as childProcess from "child_process";
import * as fs from "fs";
import { EOL as newline } from "os";
import path from "path";

import { Handler, policyHandlers, readJsonAsync } from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";

const readStdin: () => Promise<string | undefined> = async () => {
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

type policyAction = "handle" | "resolve" | "final";

/**
 * This tool enforces policies across the code base via a series of handlers.
 *
 * This command supports piping.
 *
 * i.e. `git ls-files -co --exclude-standard --full-name | flub check policy --stdin --verbose`
 *
 * @remarks
 *
 * This command is equivalent to `fluid-repo-policy-check`.
 * `fluid-repo-policy-check -s` is equivalent to `flub check policy --stdin`
 */
export class CheckPolicy extends BaseCommand<typeof CheckPolicy.flags> {
    static description =
        "Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.";

    static flags = {
        fix: Flags.boolean({
            description: `Fix errors if possible.`,
            required: false,
            char: "f",
        }),
        handler: Flags.string({
            description: `Filter handler names by <regex>.`,
            required: false,
            char: "d",
        }),
        excludeHandler: Flags.string({
            char: "D",
            description: `Exclude handler by name. Can be specified multiple times to exclude multiple handlers.`,
            exclusive: ["handler"],
            multiple: true,
        }),
        path: Flags.string({
            description: `Filter file paths by <regex>.`,
            required: false,
            char: "p",
        }),
        exclusions: Flags.file({
            description: `Path to the exclusions.json file.`,
            exists: true,
            required: true,
            char: "e",
        }),
        stdin: Flags.boolean({
            description: `Read list of files from stdin.`,
            required: false,
        }),
        listHandlers: Flags.boolean({
            description: `List all policy handlers by name.`,
            required: false,
            exclusive: ["stdin", "path", "fix", "handler"],
        }),
        ...BaseCommand.flags,
    };

    static handlerActionPerf = new Map<policyAction, Map<string, number>>();
    static processed = 0;
    static count = 0;
    static pathToGitRoot = "";

    async run() {
        const handlersToRun: Handler[] = policyHandlers.filter((h) => {
            const shouldRun = this.processedFlags.excludeHandler?.includes(h.name) === false;
            if (!shouldRun) {
                this.info(`Excluding handler: ${h.name}`);
            }
            return shouldRun;
        });

        // list the handlers then exit
        if (this.processedFlags.listHandlers) {
            for (const h of handlersToRun) {
                this.log(
                    `${h.name}\nresolver: ${h.resolver !== undefined} finalHandler: ${
                        h.final !== undefined
                    }\n`,
                );
            }
            this.log(`${handlersToRun.length} TOTAL POLICY HANDLERS`);
            this.exit(0);
        }

        const handlerRegex: RegExp =
            this.processedFlags.handler === undefined
                ? /.?/
                : new RegExp(this.processedFlags.handler, "i");

        const pathRegex: RegExp =
            this.processedFlags.path === undefined
                ? /.?/
                : new RegExp(this.processedFlags.path, "i");

        if (this.processedFlags.handler !== undefined) {
            this.info(`Filtering handlers by regex: ${handlerRegex}`);
        }

        if (this.processedFlags.path !== undefined) {
            this.info(`Filtering file paths by regex: ${pathRegex}`);
        }

        if (this.processedFlags.fix) {
            this.info("Resolving errors if possible.");
        }

        if (this.processedFlags.exclusions === undefined) {
            this.error("No exclusions file provided.");
        }

        let exclusionsFile: string[];
        try {
            exclusionsFile = await readJsonAsync(this.processedFlags.exclusions);
        } catch {
            this.error("Unable to locate or parse path to exclusions file");
        }

        const exclusions: RegExp[] = exclusionsFile.map((e: string) => new RegExp(e, "i"));

        if (this.processedFlags.stdin) {
            const pipeString = await readStdin();

            if (pipeString !== undefined) {
                try {
                    pipeString
                        .split("\n")
                        .map((line: string) =>
                            this.handleLine(
                                line,
                                handlerRegex,
                                pathRegex,
                                exclusions,
                                handlersToRun,
                            ),
                        );
                } finally {
                    try {
                        runPolicyCheck(handlersToRun, this.processedFlags.fix);
                    } finally {
                        this.logStats();
                    }
                }
            }

            return;
        }

        CheckPolicy.pathToGitRoot = childProcess
            .execSync("git rev-parse --show-cdup", { encoding: "utf8" })
            .trim();

        const p = childProcess.spawn("git", [
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
            try {
                scriptOutput
                    .split("\n")
                    .map((line: string) =>
                        this.handleLine(line, handlerRegex, pathRegex, exclusions, handlersToRun),
                    );
            } finally {
                try {
                    runPolicyCheck(handlersToRun, this.processedFlags.fix);
                } finally {
                    this.logStats();
                }
            }
        });
    }

    // route files to their handlers by regex testing their full paths
    // synchronize output, exit code, and resolve decision for all handlers
    routeToHandlers(file: string, handlerRegex: RegExp, handlers: Handler[]): void {
        handlers
            .filter((handler) => handler.match.test(file) && handlerRegex.test(handler.name))
            // eslint-disable-next-line unicorn/no-array-for-each
            .forEach((handler) => {
                const result = runWithPerf(handler.name, "handle", () =>
                    handler.handler(file, CheckPolicy.pathToGitRoot),
                );
                if (result !== undefined && result !== "") {
                    let output = `${newline}file failed policy check: ${file}${newline}${result}`;
                    const resolver = handler.resolver;
                    if (this.processedFlags.fix && resolver) {
                        output += `${newline}attempting to resolve: ${file}`;
                        const resolveResult = runWithPerf(handler.name, "resolve", () =>
                            resolver(file, CheckPolicy.pathToGitRoot),
                        );

                        if (resolveResult?.message !== undefined) {
                            output += newline + resolveResult.message;
                        }

                        if (!resolveResult.resolved) {
                            process.exitCode = 1;
                        }
                    } else {
                        process.exitCode = 1;
                    }

                    if (process.exitCode === 1) {
                        this.warning(output);
                    } else {
                        this.info(output);
                    }
                }
            });
    }

    logStats() {
        this.log(
            `Statistics: ${CheckPolicy.processed} processed, ${
                CheckPolicy.count - CheckPolicy.processed
            } excluded, ${CheckPolicy.count} total`,
        );
        for (const [action, handlerPerf] of CheckPolicy.handlerActionPerf.entries()) {
            this.log(`Performance for "${action}":`);
            for (const [handler, dur] of handlerPerf.entries()) {
                this.log(`\t${handler}: ${dur / 1000}:`);
            }
        }
    }

    handleLine(
        line: string,
        handlerRegex: RegExp,
        pathRegex: RegExp,
        exclusions: RegExp[],
        handlers: Handler[],
    ) {
        const filePath = path.join(CheckPolicy.pathToGitRoot, line).trim().replace(/\\/g, "/");

        if (!pathRegex.test(line) || !fs.existsSync(filePath)) {
            return;
        }

        CheckPolicy.count++;
        if (!exclusions.every((value) => !value.test(line))) {
            this.verbose(`Excluded: ${line}`);
            return;
        }

        try {
            this.routeToHandlers(filePath, handlerRegex, handlers);
        } catch (error: any) {
            throw new Error(`Line error: ${error}`);
        }

        CheckPolicy.processed++;
    }
}

function runWithPerf<T>(name: string, action: policyAction, run: () => T): T {
    const actionMap = CheckPolicy.handlerActionPerf.get(action) ?? new Map<string, number>();
    let dur = actionMap.get(name) ?? 0;

    const start = Date.now();
    const result = run();
    dur += Date.now() - start;

    actionMap.set(name, dur);
    CheckPolicy.handlerActionPerf.set(action, actionMap);
    return result;
}

function runPolicyCheck(handlers: Handler[], fix: boolean) {
    for (const h of handlers) {
        const final = h.final;
        if (final) {
            const result = runWithPerf(h.name, "final", () =>
                final(CheckPolicy.pathToGitRoot, fix),
            );
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (result?.error) {
                throw new Error(result.error);
            }
        }
    }
}
