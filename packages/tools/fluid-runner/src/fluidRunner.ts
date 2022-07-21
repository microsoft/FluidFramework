/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as yargs from "yargs";
import { exportFile } from "./exportFile";

function fluidRunner() {
    yargs
        .strict()
        .version(false)
        .command(
            "exportFile",
            "Generate an output for a local snapshot",
            (yargs) =>
                yargs
                    .option("codeLoader", {
                        describe: "Name of the code loader bundle",
                        type: "string",
                        demandOption: true
                    })
                    .option("inputFile", {
                        describe: "Name of the file containing local ODSP snapshot",
                        type: "string",
                        demandOption: true
                    })
                    .option("outputFolder", {
                        describe: "Name of the output file",
                        type: "string",
                        demandOption: true
                    })
                    .option("scenario", {
                        describe: "Name of scenario to invoke",
                        type: "string",
                        demandOption: true
                    })
                    .option("telemetryFile", {
                        describe: "Config and session data for telemetry",
                        type: "string",
                        demandOption: true
                    }),
            async (argv) => {
                const result = await exportFile(
                    argv.codeLoader,
                    argv.inputFile,
                    argv.outputFolder,
                    argv.scenario,
                    argv.telemetryFile,
                );
                if (!result.success) {
                    console.error(result.errorMessage);
                    process.exit(1);
                }
            }
        )
        .help()
        .demandCommand().argv;
}

fluidRunner();
