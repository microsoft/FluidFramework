/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClientReplayTool } from "./clientReplayTool";
import { ReplayArgs } from "./replayArgs";

const optionsArray = [
    "Location:",
    ["--indir <directory>", "Name of the directory containing the output of the fluid-fetch tool"],
    "Misc:",
    ["--testReconnect", "Simulates reconnect and rebuilding of pending changes"],
    ["--quiet", "Reduces amount of output"],
    ["--verbose", "Increases amount of output"],
];

/**
 * This is the main class used to take user input to replay ops for debugging purposes.
 */
class ReplayProcessArgs extends ReplayArgs {
    constructor() {
        super();
        this.parseArguments();
    }

    public parseArguments() {
        if (process.argv.length <= 2) {
            this.printUsage();
            process.exit(-1);
        }

        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            switch (arg.toLocaleLowerCase()) {
                case "--indir":
                    i += 1;
                    this.inDirName = this.parseStrArg(i);
                    break;
                case "--to":
                    i += 1;
                    this.to = this.parseIntArg(i);
                    break;
                case "--quiet":
                    this.verbose = false;
                    break;
                case "--verbose":
                    this.verbose = true;
                    break;
                default:
                    console.error(`ERROR: Invalid argument ${arg}`);
                    this.printUsage();
                    process.exit(-1);
            }
        }
    }

    public parseStrArg(i: number) {
        if (i >= process.argv.length) {
            console.error(`ERROR: Missing ${process.argv[i - 1]} argument`);
            this.printUsage();
            process.exit(-1);
        }
        return process.argv[i];
    }

    public parseIntArg(i: number) {
        if (i >= process.argv.length) {
            console.error(`ERROR: Missing ${process.argv[i - 1]} argument`);
            this.printUsage();
            process.exit(-1);
        }
        const numStr = process.argv[i];
        const paramNumber = parseInt(numStr, 10);
        if (isNaN(paramNumber) || paramNumber < 0) {
            console.error(`ERROR: Invalid ${name} ${numStr}`);
            this.printUsage();
            process.exit(-1);
        }
        return paramNumber;
    }

    public printUsage() {
        console.log("Usage: replayTool [options]");
        const empty = "".padEnd(32);
        for (const rec of optionsArray) {
            if (typeof rec === "string") {
                console.log("");
                console.log(rec);
            } else {
                let header = `${rec[0].padEnd(32)}`;
                for (const el of rec.slice(1)) {
                    console.log(`  ${header}${el}`);
                    header = empty;
                }
            }
        }
    }
}

let finished = false;

process.on("exit", (code) => {
    if (code === 0 && !finished) {
        console.error("Deadlock in ReplayTool!");
        process.exit(3);
    }
});

new ClientReplayTool(new ReplayProcessArgs())
    .Go()
    .then((success) => {
        // If we failed, exit with non-zero code
        // If we succeeded, do not exit process - that will hide errors about unhandled promise rejections!
        // Node will eventually exit when there is no code to run, and will validate all hanging promises
        if (!success) {
            process.exit(1);
        }
        finished = true;
    })
    .catch((error) => {
        console.error(`ERROR: ${error}`);
        process.exit(2);
    });
