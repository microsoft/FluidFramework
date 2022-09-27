/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as yargs from "yargs";
import { exportFile } from "./exportFile";
import { IFluidFileConverter } from "./codeLoaderBundle";
import { parseBundleAndExportFile } from "./parseBundleAndExportFile";

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
                        // eslint-disable-next-line max-len
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
                    }),
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            async (argv) => {
                const argsError = validateProvidedArgs(argv.codeLoader, fluidFileConverter);
                if (argsError) {
                    console.error(argsError);
                    process.exit(1);
                }

                const result = await (argv.codeLoader
                    ? parseBundleAndExportFile(
                        argv.codeLoader,
                        argv.inputFile,
                        argv.outputFile,
                        argv.telemetryFile,
                        argv.options,
                    ) : exportFile(
                        fluidFileConverter!,
                        argv.inputFile,
                        argv.outputFile,
                        argv.telemetryFile,
                        argv.options,
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

function validateProvidedArgs(
    codeLoader?: string,
    fluidFileConverter?: IFluidFileConverter,
): string | undefined {
    if (codeLoader !== undefined && fluidFileConverter !== undefined) {
        return "\"codeLoader\" and \"fluidFileConverter\" cannot both be provided. See \"fluidRunner.ts\" for details.";
    }
    if (codeLoader === undefined && fluidFileConverter === undefined) {
        // eslint-disable-next-line max-len
        return "\"codeLoader\" must be provided if there is no explicit \"fluidFileConverter\". See \"fluidRunner.ts\" for details.";
    }
    return undefined;
}

fluidRunner();
