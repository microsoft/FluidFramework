/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Loader } from "@fluidframework/container-loader";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import * as fs from "fs";
import FileLogger from "./logger/FileLogger";
import { getArgsValidationError } from "./getArgsValidationError";
import { IFluidFileConverter, isCodeLoaderBundle } from "./codeLoaderBundle";
import { FakeUrlResolver } from "./fakeUrlResolver";
import path from "path";
import { ITelemetryLogger } from "@fluidframework/common-definitions";

export type IExportFileResponse = IExportFileResponseSuccess | IExportFileResponseFailure;

interface IExportFileResponseSuccess {
    success: true;
}

interface IExportFileResponseFailure {
    success: false;
    errorMessage: string;
}

export async function exportFile(
    codeLoader: string,
    inputFile: string,
    outputFolder: string,
    scenario: string,
    telemetryFile: string,
): Promise<IExportFileResponse> {
    if (fs.existsSync(telemetryFile)) {
        return { success: false, errorMessage: `Telemetry file already exists [${telemetryFile}]` };
    }

    const fileLogger = new FileLogger(telemetryFile, 50);

    const logger = ChildLogger.create(fileLogger, "LocalSnapshotRunnerApp",
        { all: { "Event_Time": () => Date.now() } });

    try {
        await PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () => {
            const codeLoaderBundle = require(codeLoader);
            if (!isCodeLoaderBundle(codeLoaderBundle)) {
                const message = "Code loader bundle is not of type CodeLoaderBundle";
                logger.sendErrorEvent({
                    eventName: "Client_ArgsValidationError",
                    message,
                });
                return { success: false, errorMessage: message };
            }

            const argsValidationError = getArgsValidationError(inputFile, outputFolder, scenario);
            if (argsValidationError) {
                logger.sendErrorEvent({
                    eventName: "Client_ArgsValidationError",
                    message: argsValidationError,
                });
                return { success: false, errorMessage: argsValidationError };
            }

            // TODO: read file stream
            const inputFileContent = fs.readFileSync(inputFile, { encoding: "utf-8" });

            const results = await createContainerAndExecute(inputFileContent, logger, await codeLoaderBundle.fluidExport);
            for (const key in results) {
                fs.appendFileSync(path.join(outputFolder, key), results[key]);
            }
        });
    } catch (error) {
        logger.sendErrorEvent({ eventName: "Client_UnexpectedError" }, error);
        return { success: false, errorMessage: "Unexpected error" };
    } finally {
        await fileLogger.flush();
    }

    return { success: true };
}

export async function createContainerAndExecute(
    localOdspSnapshot: string,
    logger: ITelemetryLogger,
    fluidFileConverter: IFluidFileConverter,
): Promise<Record<string, string>> {
    const loader = new Loader({
        urlResolver: new FakeUrlResolver(),
        documentServiceFactory: createLocalOdspDocumentServiceFactory(localOdspSnapshot),
        codeLoader: fluidFileConverter.codeLoader,
        scope: fluidFileConverter.scope,
    });
    
    const container = await loader.resolve({ url: "/fakeUrl/" });

    return await PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () =>
        fluidFileConverter.execute(container, logger));
}
