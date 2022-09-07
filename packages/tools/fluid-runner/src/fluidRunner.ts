/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as yargs from "yargs";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { exportFile, IExportFileResponse, parseBundleAndExportFile } from "./exportFile";
// eslint-disable-next-line import/no-internal-modules
import { FileLogger } from "./logger/FileLogger";
import { IFluidFileConverter } from "./codeLoaderBundle";

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
                const argsError = validateProvidedArgs(argv.telemetryFile, argv.codeLoader, fluidFileConverter);
                if (argsError) {
                    console.error(argsError);
                    process.exit(1);
                }

                const fileLogger = new FileLogger(argv.telemetryFile);

                const logger = ChildLogger.create(fileLogger, "LocalSnapshotRunnerApp",
                    { all: { Event_Time: () => Date.now() } });

                let result: IExportFileResponse;
                // codeLoader argument always takes precedence
                if (argv.codeLoader) {
                    result = await parseBundleAndExportFile(
                        argv.codeLoader,
                        argv.inputFile,
                        argv.outputFile,
                        logger,
                        argv.options,
                    );
                } else {
                    result = await exportFile(
                        fluidFileConverter!,
                        argv.inputFile,
                        argv.outputFile,
                        logger,
                        argv.options,
                    );
                }

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

function validateProvidedArgs(
    telemetryFile: string,
    codeLoader?: string,
    fluidFileConverter?: IFluidFileConverter,
): string | undefined {
    if (fs.existsSync(telemetryFile)) {
        return `Telemetry file already exists [${telemetryFile}]`;
    }
    if (codeLoader === undefined && fluidFileConverter === undefined) {
        // eslint-disable-next-line max-len
        return "\"codeLoader\" must be provided if there is no explicit \"fluidFileConverter\". See \"fluidRunner.ts\" for details.";
    }
    return undefined;
}

fluidRunner();
