/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { EOL as newline } from "os";
import * as childProcess from "child_process";
// eslint-disable-next-line unicorn/import-style
import * as path from "path";
import { Flags } from "@oclif/core";
import { handlers, exclusionsFile } from "@fluidframework/build-tools";
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
        exclusions: Flags.file({
            description: `Path to the exclusions.json file`,
            exists: true,
            required: true,
            char: "e",
            default: "exclusions.json",
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
        if (this.processedFlags.fix) {
            this.log("Resolving errors if possible.");
        }



        const handlerRegex: RegExp =
            // eslint-disable-next-line no-negated-condition
            this.processedFlags.handler !== undefined
                ? new RegExp(this.processedFlags.handler, "i")
                : /.?/;
        const pathRegex: RegExp =
            // eslint-disable-next-line no-negated-condition
            this.processedFlags.path !== undefined
                ? new RegExp(this.processedFlags.path, "i")
                : /.?/;

        if (this.processedFlags.handler !== undefined) {
            this.log(`Filtering handlers by regex: ${handlerRegex}`);
        }

        if (this.processedFlags.path !== undefined) {
            this.log(`Filtering file paths by regex: ${pathRegex}`);
        }

        const exclusions: RegExp[] = this.processedFlags.exclusions === undefined ?
        exclusionsFile.map(
            (e: string) => new RegExp(e, "i"),
        ) :
        // eslint-disable-next-line @typescript-eslint/no-require-imports, unicorn/prefer-module
        require(this.processedFlags.exclusions).map(
            (e: string) => new RegExp(e, "i"),
        )


        if (this.processedFlags.stdin) {
            const pipeString = await readStdin();

            if (pipeString !== undefined) {
                pipeString
                    .split("\n")
                    .map((line: string) =>
                        this.handleLine(line, handlerRegex, pathRegex, exclusions),
                    );
            }

            try {
                runPolicyCheck(this.processedFlags.fix);
            } finally {
                this.logStats();
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
            scriptOutput
                .split("\n")
                .map((line: string) => this.handleLine(line, handlerRegex, pathRegex, exclusions));
            try {
                runPolicyCheck(this.processedFlags.fix);
            } finally {
                this.logStats();
            }
        });
    }

    // route files to their handlers by regex testing their full paths
    // synchronize output, exit code, and resolve decision for all handlers
    routeToHandlers(file: string, handlerRegex: RegExp) {
        const filteredHandlers = handlers.filter(
            (handler) =>
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-return
                handler.match.test(file) && handlerRegex.test(handler.name),
        );

        for (const handler of filteredHandlers) {
            const result = runWithPerf(handler.name, "handle", () =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                handler.handler(file, CheckPolicy.pathToGitRoot),
            );

            if (result === undefined) {
                return;
            }

            let output = `${newline}file failed policy check: ${file}${newline}${result}`;
            const resolver = handler.resolver;

            if (!this.processedFlags.fix || resolver === undefined) {
                return this.exit(1);
            }

            output += `${newline}attempting to resolve: ${file}`;
            const resolveResult = runWithPerf(handler.name, "resolve", () =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                resolver(file, CheckPolicy.pathToGitRoot),
            );

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (resolveResult.message) {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                output += newline + resolveResult.message;
            }

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
        if (exclusions.every((value) => !value.test(line))) {
            this.log(`Excluded: ${line}`);
            return;
        }

        try {
            this.routeToHandlers(filePath, handlerRegex);
            runPolicyCheck(this.processedFlags.fix);
        } catch {
            this.logStats();
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
    for (const h of handlers) {
        const final = h.final;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (final) {
            const result = runWithPerf(h.name, "final", () =>
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                final(CheckPolicy.pathToGitRoot, fix),
            );
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (result?.error) {
                throw new Error(result.error);
            }
        }
    }
}
