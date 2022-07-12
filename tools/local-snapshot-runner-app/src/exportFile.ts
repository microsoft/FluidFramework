/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Loader } from "@fluidframework/container-loader";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import * as fs from "fs";
import FileLogger from "./logger/FileLogger";
import { getArgsValidationError } from "./getArgsValidationError";
import { isCodeLoaderBundle } from "./codeLoaderBundle";
import { FakeUrlResolver } from "./fakeUrlResolver";

export async function exportFile(
    codeLoader: string,
    inputFile: string,
    outputFolder: string,
    scenario: string,
    telemetryFile: string,
    props: string
) {
    if (fs.existsSync(telemetryFile)) {
        console.log("Telemetry file already exists. " + telemetryFile);
        throw new Error("Telemetry file already exists.");
    }

    const logger = ChildLogger.create(new FileLogger(telemetryFile), "LocalSnapshotRunnerApp");

    try {
        const codeLoaderBundle = require(codeLoader);
        if (!isCodeLoaderBundle(codeLoaderBundle)) {
            logger.sendErrorEvent({
                eventName: "Client_ArgsValidationError",
                message: "Code loader bundle is not of type CodeLoaderBundle",
            });
            return;
        }

        const argsValidationError = getArgsValidationError(inputFile, outputFolder, scenario, props);
        if (argsValidationError) {
            logger.sendErrorEvent({
                eventName: "Client_ArgsValidationError",
                message: argsValidationError,
            });
            return;
        }

        // TODO: read file stream
        const inputFileContent = fs.readFileSync(inputFile, { encoding: "utf-8" });

        const loader = new Loader({
            urlResolver: new FakeUrlResolver(),
            documentServiceFactory: createLocalOdspDocumentServiceFactory(inputFileContent),
            codeLoader: await codeLoaderBundle.getCodeLoader(),
        });

        const container = await loader.rehydrateDetachedContainerFromSnapshot(inputFileContent);

        const result = await codeLoaderBundle.getResult(container);

        fs.appendFileSync(outputFolder + "/result.txt", result);

        logger.sendTelemetryEvent({ eventName: "Client_ExportCompleted" });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.sendErrorEvent({ eventName: "Client_UnknownError", message: error.message }, error);
    }
}
