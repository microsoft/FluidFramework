/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as yargs from "yargs";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { exportFile } from "./exportFile";
// eslint-disable-next-line import/no-internal-modules
import { FileLogger } from "./logger/FileLogger";

function fluidRunner() {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    yargs
        .strict()
        .version(false)
        .command(
            "exportFile",
            "Generate an output for a local snapshot",
            // eslint-disable-next-line @typescript-eslint/no-shadow
            (yargs) =>
                yargs
                    .option("codeLoader", {
                        describe: "Name of the code loader bundle",
                        type: "string",
                        demandOption: true,
                    })
                    .option("inputFile", {
                        describe: "Name of the file containing local ODSP snapshot",
                        type: "string",
                        demandOption: true,
                    })
                    .option("outputFolder", {
                        describe: "Name of the output file",
                        type: "string",
                        demandOption: true,
                    })
                    .option("scenario", {
                        describe: "Name of scenario to invoke",
                        type: "string",
                        demandOption: true,
                    })
                    .option("telemetryFile", {
                        describe: "Config and session data for telemetry",
                        type: "string",
                        demandOption: true,
                    }),
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            async (argv) => {
                if (fs.existsSync(argv.telemetryFile)) {
                    console.error(`Telemetry file already exists [${argv.telemetryFile}]`);
                    process.exit(1);
                }

                const fileLogger = new FileLogger(argv.telemetryFile);

                const logger = ChildLogger.create(fileLogger, "LocalSnapshotRunnerApp",
                    { all: { Event_Time: () => Date.now() } });

                const result = await exportFile(
                    argv.codeLoader,
                    argv.inputFile,
                    argv.outputFolder,
                    argv.scenario,
                    logger,
                );

                if (!result.success) {
                    console.error(`${result.eventName}: ${result.errorMessage}`);
                    logger.sendErrorEvent({ eventName: result.eventName, message: result.errorMessage }, result.error);
                    await fileLogger.flush();
                    process.exit(1);
                } else {
                    await fileLogger.flush();
                }
            },
        )
        .help()
        .demandCommand().argv;
}

fluidRunner();
