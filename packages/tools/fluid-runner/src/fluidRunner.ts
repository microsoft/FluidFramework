/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as yargs from "yargs";
import { exportFile } from "./exportFile";

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
                const result = await exportFile(
                    argv.codeLoader,
                    argv.inputFile,
                    argv.outputFolder,
                    argv.scenario,
                    argv.telemetryFile,
                );
                if (!result.success) {
                    console.error(`${result.eventName}: ${result.errorMessage}`);
                    process.exit(1);
                }
            },
        )
        .help()
        .demandCommand().argv;
}

fluidRunner();
