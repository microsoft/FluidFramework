/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import { Command, Flags } from "@oclif/core";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ConsoleLogger } from "../logger";

// Allow for dynamic injection of a logger. Leveraged in internal CI pipelines.
// The parameter to getTestLogger() is a delay to apply after flushing the buffer.
const _global: any = global;
let logger: ITelemetryBufferedLogger = _global.getTestLogger?.(5_000);

if (logger === undefined) {
    logger = new ConsoleLogger();
}

const testTypeHandlers = new Map<string, (fileData) => void>();

// Handler for ExecutionTime tests
testTypeHandlers.set("executionTime", (fileData) => {
    fileData.benchmarks.forEach((testData) => {
        logger.send({
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "ExecutionTime",
            suiteName: fileData.suiteName,
            benchmarkName: testData.benchmarkName,
            arithmeticMean: testData.stats.arithmeticMean,
            marginOfError: testData.stats.marginOfError,
        });
    });
});

// Handler for MemoryUsage tests
testTypeHandlers.set("memoryUsage", (fileData) => {
    fileData.tests.forEach((testData) => {
        logger.send({
            category: "performance",
            eventName: "Benchmark",
            benchmarkType: "MemoryUsage",
            suiteName: fileData.suiteName,
            testName: testData.testName,
            heapUsedAvg: testData.testData.stats.mean,
            heapUsedStdDev: testData.testData.stats.deviation,
        });
    });
});

export class EntryPoint extends Command {
    static flags = {
        help: Flags.help(),
        testType: Flags.enum({
            char: "t",
            required: true,
            options: ["executionTime", "memoryUsage"],
            description: "Type of tests contained in the specified folder(s).",
        }),
        dir: Flags.string({
            char: "d",
            multiple: true,
            required: true,
            description: "Folder that contain the test output files to process. " +
                         "Files in subfolders are also processed. Can be specified multiple times.",
        }),
    };

    static examples = [
        {
            command: "$ node bin/run --testType executionTime --dir /path/to/execution-time/tests",
            description: "Process execution-time tests from /path/to/execution-time/tests and all its subfolders",
        },
    ];

    async run() {
        const { flags } = await this.parse(EntryPoint);

        const handler = testTypeHandlers.get(flags.testType);
        if (handler === undefined) {
            console.error(`Unexpected test type '${flags.testType}'`);
            process.exit(1);
        }

        const dirs = [...flags.dir];

        const filesToProcess: string[] = [];

        while (dirs.length > 0) {
            const dir: string = dirs.pop()!;
            const files = fs.readdirSync(dir, { withFileTypes: true });
            files.forEach((dirent) => {
                const direntFullPath = path.join(dir, dirent.name);
                if (dirent.isDirectory()) {
                    dirs.push(direntFullPath);
                    return;
                }
                // We expect the files to be processed to be .json files. Ignore everything else.
                if (!dirent.name.endsWith(".json")) {
                    return;
                }
                filesToProcess.push(direntFullPath);
            });
        }

        filesToProcess.forEach((fullPath) => {
            try {
                console.log(`Processing file '${fullPath}'`);
                const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
                handler(data);
            } catch (err) {
                console.error(`Unexpected error processing file '${fullPath}'.\n${err}`);
            }
        });

        await logger.flush();
    }
}
