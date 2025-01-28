/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as readline from "readline";
import * as child_process from "child_process";
import * as path from "path";
import { EOL as newline } from "os";
import program from "commander";
import { Handler } from "./common";
import { handler as assertShortCodeHandler } from "./handlers/assertShortCode";
import { handlers as copyrightFileHeaderHandlers } from "./handlers/copyrightFileHeader";
import { handlers as npmPackageContentsHandlers } from "./handlers/npmPackages";
import { handler as fluidCaseHandler } from "./handlers/fluidCase";
import { handlers as lockfilesHandlers } from "./handlers/lockfiles";

const exclusions: RegExp[] = require('../../data/exclusions.json').map((e: string) => new RegExp(e, "i"));

/**
 * argument parsing
 */
program
    .option('-v|--verbose', 'Verbose mode')
    .option('-r|--resolve', 'Resolve errors if possible')
    .option('-h|--handler <regex>', 'Filter handler names by <regex>')
    .option('-p|--path <regex>', 'Filter file paths by <regex>')
    .option('-s|--stdin', 'Get file from stdin')
    .parse(process.argv);

const handlerRegex = (program.handler ? new RegExp(program.handler, 'i') : /.?/);
const pathRegex = (program.path ? new RegExp(program.path, 'i') : /.?/);

function writeOutLine(output: string) {
    if (program.verbose) {
        console.log(output);
    }
}

if (program.resolve) {
    writeOutLine('Resolving errors if possible.');
}

if (program.handler) {
    writeOutLine(`Filtering handlers by regex: ${handlerRegex}`);
}

if (program.path) {
    writeOutLine(`Filtering file paths by regex: ${pathRegex}`);
}

/**
 * declared file handlers
 */
const handlers: Handler[] = [
    ...copyrightFileHeaderHandlers,
    ...npmPackageContentsHandlers,
    fluidCaseHandler,
    ...lockfilesHandlers,
    assertShortCodeHandler,
];

const handlerActionPerf = new Map<"handle" | "resolve" | "final", Map<string, number>>();

function runWithPerf<T>(name: string, action: "handle" | "resolve" | "final", run: () => T): T {
    const actionMap = handlerActionPerf.get(action) ?? new Map<string, number>();
    let dur = actionMap.get(name) ?? 0;

    const start = Date.now();
    const result = run();
    dur += Date.now() - start

    actionMap.set(name, dur);
    handlerActionPerf.set(action, actionMap);
    return result;
}

// route files to their handlers by regex testing their full paths
// synchronize output, exit code, and resolve decision for all handlers
function routeToHandlers(file: string) {
    handlers.filter(handler => handler.match.test(file) && handlerRegex.test(handler.name)).map(handler => {
        const result = runWithPerf(handler.name, "handle", () => handler.handler(file, pathToGitRoot));
        if (result) {
            let output = newline + 'file failed policy check: ' + file + newline + result;
            const resolver = handler.resolver;
            if (program.resolve && resolver) {
                output += newline + 'attempting to resolve: ' + file;
                const resolveResult = runWithPerf(handler.name, "resolve", () => resolver(file, pathToGitRoot));

                if (resolveResult.message) {
                    output += newline + resolveResult.message;
                }

                if (!resolveResult.resolved) {
                    process.exitCode = 1;
                }
            } else {
                process.exitCode = 1;
            }
            console.log(output);
        }
    });
}

let lineReader: readline.Interface;
let pathToGitRoot = "";
if (program.stdin) {
    // prepare to read standard input line by line
    process.stdin.setEncoding('utf8');
    lineReader = readline.createInterface({
        input: process.stdin,
        terminal: false
    });
} else {
    pathToGitRoot = child_process.execSync("git rev-parse --show-cdup", { encoding: "utf8" }).trim();
    const p = child_process.spawn("git", ["ls-files", "-co", "--exclude-standard", "--full-name"]);
    lineReader = readline.createInterface({
        input: p.stdout,
        terminal: false
    });
}

let count = 0;
let processed = 0;
lineReader.on('line', line => {
    const filePath = path.join(pathToGitRoot, line).trim().replace(/\\/g, "/");
    if (pathRegex.test(line) && fs.existsSync(filePath)) {
        count++;
        if (exclusions.every(value => !value.test(line))) {
            routeToHandlers(filePath);
            processed++;
        } else {
            writeOutLine(`Excluded: ${line}`);
        }
    }
});

lineReader.once("close", () => {
    handlers.forEach((h) => {
        const final = h.final;
        if (final) {
            const result = runWithPerf(h.name, "final", () => final(pathToGitRoot, program.resolve));
            if (result?.error) {
                process.exitCode = 1;
                console.log(result.error);
            }
        }
    });
});


process.on("beforeExit", () => {
    writeOutLine(`Statistics: ${processed} processed, ${count - processed} excluded, ${count} total`);
    handlerActionPerf.forEach((handlerPerf, action) => {
        writeOutLine(`Performance for "${action}":`);
        handlerPerf.forEach((dur, handler) => {
            writeOutLine(`\t${handler}: ${dur / 1000}:`);
        });
    });
});
