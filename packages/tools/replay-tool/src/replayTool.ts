/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { playMessagesFromFileStorage } from "./replayMessages";
import { initializeFileDocumentService } from "./replayToolInit";

export let replayTool: ReplayTool;

const optionsArray =
    [
        ["--indir <directory>", "Name of the directory containing the output of the prague dumper tool"],
        ["--to <op#>", "The last op number to be replayed"],
        ["--snapshot", "Take snapshot after replaying all the ops"],
        ["--snapfreq <N>", "A snapshot will be taken after every <N>th op"],
        ["--outdir <directory>", "Name of the output directory where the snapshots will appear",
                     "If not specified a directory will be created in current directory with name Output"],
        ["--version <version>", "Load document from particualr snapshot.",
                     "<Version> is the name of the directory inside the --indir containing the snapshot blobs"],
    ];

/**
 * This is the main class used to take user input to replay ops for debugging purposes.
 */
export class ReplayTool {

    public inDirName: string;
    public outDirName: string = "output";
    public from: number = 0;
    public to: number = Number.MAX_SAFE_INTEGER;
    public takeSnapshot = false;
    public snapFreq: number;
    public version: string;

    constructor() {
        this.parseArguments();
    }

    public parseArguments() {
        if (process.argv.length <= 2) {
            this.printUsage();
            process.exit(-1);
        }

        for (let i = 2; i < process.argv.length; i++) {
            const arg = process.argv[i];
            switch (arg) {
                case "--indir":
                    i += 1;
                    this.inDirName = this.parseStrArg(i, "File name");
                    break;
                case "--to":
                    i += 1;
                    this.to = this.parseIntArg(i, "To");
                    break;
                case "--snapshot":
                    this.takeSnapshot = true;
                    break;
                case "--snapfreq":
                    i += 1;
                    this.snapFreq = this.parseIntArg(i, "Snapshot Frequency");
                    break;
                case "--outdir":
                    i += 1;
                    this.outDirName = this.parseStrArg(i, "Output Directory");
                    break;
                case "--version":
                    i += 1;
                    this.version = this.parseStrArg(i, "Snapshot Version");
                    break;
                default:
                    console.error(`ERROR: Invalid argument ${arg}`);
                    this.printUsage();
                    process.exit(-1);
            }
        }
    }

    public parseStrArg(i: number, name: string) {
        if (i >= process.argv.length) {
            console.error(`ERROR: Missing ${name}`);
            this.printUsage();
            process.exit(-1);
        }
        return process.argv[i];
    }

    public parseIntArg(i: number, name: string) {
        if (i >= process.argv.length) {
            console.error(`ERROR: Missing ${name}`);
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
        console.log("Options:");
        const empty = "".padEnd(32);
        for (const rec of optionsArray) {
            let header = `${rec[0].padEnd(32)}`;
            for (const el of rec.slice(1)) {
                console.log(`  ${header}${el}`);
                header = empty;
            }
        }
    }
}

async function replayToolMain() {
    replayTool = new ReplayTool();
    const documentServiceFactory = await initializeFileDocumentService(replayTool.inDirName);
    await playMessagesFromFileStorage(replayTool, documentServiceFactory);
}

replayToolMain()
    .catch((error: string) => console.log(`ERROR: ${error}`))
    .finally(() => {
        process.exit(0);
    });
