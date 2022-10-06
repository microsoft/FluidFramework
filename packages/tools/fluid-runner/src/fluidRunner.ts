/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
import * as yargs from "yargs";
import { exportFile } from "./exportFile";
import { IFluidFileConverter } from "./codeLoaderBundle";
import { parseBundleAndExportFile } from "./parseBundleAndExportFile";
// eslint-disable-next-line import/no-internal-modules
import { validateAndParseTelemetryOptions } from "./logger/loggerUtils";
import { validateCommandLineArgs } from "./utils";

/**
 * @param fluidFileConverter - needs to be provided if "codeLoaderBundle" is not and vice versa
 */
export function fluidRunner(fluidFileConverter?: IFluidFileConverter) {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    yargs
        .strict()
        .version(false)
        .command(
            "exportFile",
            "Generate an output for a local ODSP snapshot",
            // eslint-disable-next-line @typescript-eslint/no-shadow
            (yargs) =>
                yargs
                    .option("codeLoader", {
                        describe: "Path to code loader bundle. Required if this application is being called without modification.\nSee \"README.md\" for more details.",
                        type: "string",
                        demandOption: false,
                    })
                    .option("inputFile", {
                        describe: "Path to local ODSP snapshot",
                        type: "string",
                        demandOption: true,
                    })
                    .option("outputFile", {
                        describe: "Path of output file (cannot already exist).\nExecution result will be written here",
                        type: "string",
                        demandOption: true,
                    })
                    .option("telemetryFile", {
                        describe: "Path of telemetry file for config and session data (cannot already exist)",
                        type: "string",
                        demandOption: true,
                    })
                    .option("options", {
                        describe: "Additional options passed to container on execution",
                        type: "string",
                        demandOption: false,
                    })
                    .option("telemetryFormat", {
                        describe: "Output format for telemetry. Current options are: [\"JSON\", \"CSV\"]",
                        type: "string",
                        demandOption: false,
                        default: "JSON",
                    })
                    .option("telemetryProp", {
                        describe: "Property to add to every telemetry entry. Formatted like \"--telemetryProp prop1 value1 --telemetryProp prop2 \\\"value 2\\\"\".",
                        type: "array",
                        demandOption: false,
                    }),
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            async (argv) => {
                const argsError = validateCommandLineArgs(argv.codeLoader, fluidFileConverter);
                if (argsError) {
                    console.error(argsError);
                    process.exit(1);
                }
                const telemetryOptionsResult = validateAndParseTelemetryOptions(argv.telemetryFormat, argv.telemetryProp);
                if (!telemetryOptionsResult.success) {
                    console.error(telemetryOptionsResult.error);
                    process.exit(1);
                }

                const result = await (argv.codeLoader
                    ? parseBundleAndExportFile(
                        argv.codeLoader,
                        argv.inputFile,
                        argv.outputFile,
                        argv.telemetryFile,
                        argv.options,
                        telemetryOptionsResult.telemetryOptions,
                    ) : exportFile(
                        fluidFileConverter!,
                        argv.inputFile,
                        argv.outputFile,
                        argv.telemetryFile,
                        argv.options,
                        telemetryOptionsResult.telemetryOptions,
                    ));

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
/* eslint-enable max-len */
