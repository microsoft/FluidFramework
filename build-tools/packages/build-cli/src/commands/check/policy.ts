/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { EOL as newline } from "os";
import * as childProcess from "child_process";
import path from "path";
import { Flags } from "@oclif/core";
import { policyHandlers, readJsonAsync } from "@fluidframework/build-tools";
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
 * This tool enforces polices across the code base via a series of handlers.
 * This command supports piping. The flag is modified from s to stdin
 * i.e. `git ls-files -co --exclude-standard --full-name | flub check policy --stdin --verbose`
 *
 * @remarks
 *
 * This command is equivalent to `fluid-repo-policy-check`.
 * fluid-repo-policy-check -s is equivalent to flub check policy --stdin
 */
export class CheckPolicy extends BaseCommand<typeof CheckPolicy.flags> {
    static description =
        "Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.";

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
        exclusions: Flags.file({
            description: `Path to the exclusions.json file`,
            exists: true,
            required: true,
            char: "e",
        }),
        stdin: Flags.boolean({
            description: `Get file from stdin`,
            required: false,
        }),
        ...BaseCommand.flags,
    };

    static handlerActionPerf = new Map<policyAction, Map<string, number>>();
    static processed = 0;
    static count = 0;
    static pathToGitRoot = "";

    async run() {
        const handlerRegex: RegExp =
            this.processedFlags.handler === undefined
                ? /.?/
                : new RegExp(this.processedFlags.handler, "i");

        const pathRegex: RegExp =
            this.processedFlags.path === undefined
                ? /.?/
                : new RegExp(this.processedFlags.path, "i");

        if (this.processedFlags.handler !== undefined) {
            this.log(`Filtering handlers by regex: ${handlerRegex}`);
        }

        if (this.processedFlags.path !== undefined) {
            this.log(`Filtering file paths by regex: ${pathRegex}`);
        }

        if (this.processedFlags.fix) {
            this.log("Resolving errors if possible.");
        }

        if (this.processedFlags.exclusions === undefined) {
            this.error("ERROR: No exclusions file provided.");
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
                            this.handleLine(line, handlerRegex, pathRegex, exclusions),
                        );
                } finally {
                    this.onExit();
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
                        this.handleLine(line, handlerRegex, pathRegex, exclusions),
                    );
            } finally {
                this.onExit();
            }
        });
    }

    onExit() {
        try {
            runPolicyCheck(this.processedFlags.fix);
        } finally {
            this.logStats();
        }
    }

    // route files to their handlers by regex testing their full paths
    // synchronize output, exit code, and resolve decision for all handlers
    routeToHandlers(file: string, handlerRegex: RegExp) {
        const filteredHandlers = policyHandlers.filter(
            (handler) => handler.match.test(file) && handlerRegex.test(handler.name),
        );

        for (const handler of filteredHandlers) {
            const result = runWithPerf(handler.name, "handle", () =>
                handler.handler(file, CheckPolicy.pathToGitRoot),
            );
            const resolver = handler.resolver;

            if (result === undefined) {
                return;
            }

            if (!this.processedFlags.fix || resolver === undefined) {
                return this.exit(1);
            }

            let output = `${newline}file failed policy check: ${file}${newline}${result}`;

            output += `${newline}attempting to resolve: ${file}`;
            const resolveResult = runWithPerf(handler.name, "resolve", () =>
                resolver(file, CheckPolicy.pathToGitRoot),
            );

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (resolveResult.message) {
                output += newline + resolveResult.message;
            }

            if (!resolveResult.resolved) {
                return this.exit(1);
            }

            this.log(output);
        }
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

    handleLine(line: string, handlerRegex: RegExp, pathRegex: RegExp, exclusions: RegExp[]) {
        const filePath = path.join(CheckPolicy.pathToGitRoot, line).trim().replace(/\\/g, "/");

        if (!pathRegex.test(line) || !fs.existsSync(filePath)) {
            return;
        }

        CheckPolicy.count++;
        if (!exclusions.every((value) => !value.test(line))) {
            this.log(`Excluded: ${line}`);
            return;
        }

        try {
            this.routeToHandlers(filePath, handlerRegex);
        } catch {
            throw new Error("Line error");
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

function runPolicyCheck(fix: boolean) {
    for (const h of policyHandlers) {
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
