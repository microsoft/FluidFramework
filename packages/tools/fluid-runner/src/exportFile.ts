/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { getArgsValidationError } from "./getArgsValidationError";
import { IFluidFileConverter, isCodeLoaderBundle, isFluidFileConverter } from "./codeLoaderBundle";
import { FakeUrlResolver } from "./fakeUrlResolver";
import { isJsonSnapshot } from "./utils";

export type IExportFileResponse = IExportFileResponseSuccess | IExportFileResponseFailure;

interface IExportFileResponseSuccess {
    success: true;
}

interface IExportFileResponseFailure {
    success: false;
    eventName: string;
    errorMessage: string;
    error?: any;
}

const clientArgsValidationError = "Client_ArgsValidationError";

/**
 * Intermediary method to extract IFluidFileConverter from a provided JS bundle path
 * @param codeLoader - path to provided JS bundle
 */
export async function parseBundleAndExportFile(
    codeLoader: string,
    inputFile: string,
    outputFile: string,
    logger: ITelemetryLogger,
    options?: string,
): Promise<IExportFileResponse> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const codeLoaderBundle = require(codeLoader);
    if (!isCodeLoaderBundle(codeLoaderBundle)) {
        const eventName = clientArgsValidationError;
        const errorMessage = "Code loader bundle is not of type ICodeLoaderBundle";
        return { success: false, eventName, errorMessage };
    }

    const fluidExport = await codeLoaderBundle.fluidExport;
    if (!isFluidFileConverter(fluidExport)) {
        const eventName = clientArgsValidationError;
        const errorMessage = "Fluid export from CodeLoaderBundle is not of type IFluidFileConverter";
        return { success: false, eventName, errorMessage };
    }

    return exportFile(fluidExport, inputFile, outputFile, logger, options);
}

/**
 * Execute code on container based on ODSP snapshot and write result to file
 */
export async function exportFile(
    fluidFileConverter: IFluidFileConverter,
    inputFile: string,
    outputFile: string,
    logger: ITelemetryLogger,
    options?: string,
): Promise<IExportFileResponse> {
    try {
        return await PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () => {
            const argsValidationError = getArgsValidationError(inputFile, outputFile);
            if (argsValidationError) {
                const eventName = clientArgsValidationError;
                return { success: false, eventName, errorMessage: argsValidationError };
            }

            // TODO: read file stream
            let inputFileContent: string | Uint8Array;
            if (isJsonSnapshot(inputFile)) {
                inputFileContent = fs.readFileSync(inputFile, { encoding: "utf-8" });
            } else {
                inputFileContent = fs.readFileSync(inputFile);
            }

            fs.appendFileSync(outputFile, await createContainerAndExecute(
                inputFileContent,
                fluidFileConverter,
                logger,
                options,
            ));

            return { success: true };
        });
    } catch (error) {
        const eventName = "Client_UnexpectedError";
        return { success: false, eventName, errorMessage: "Unexpected error", error };
    }
}

/**
 * Create the container based on an ODSP snapshot and execute code on it
 * @returns result of execution
 */
export async function createContainerAndExecute(
    localOdspSnapshot: string | Uint8Array,
    fluidFileConverter: IFluidFileConverter,
    logger: ITelemetryLogger,
    options?: string,
): Promise<string> {
    const loader = new Loader({
        urlResolver: new FakeUrlResolver(),
        documentServiceFactory: createLocalOdspDocumentServiceFactory(localOdspSnapshot),
        codeLoader: await fluidFileConverter.getCodeLoader(logger),
        scope: fluidFileConverter.scope,
        logger,
    });

    const container = await loader.resolve({ url: "/fakeUrl/", headers: {
        [LoaderHeader.loadMode]: { opsBeforeReturn: "cached" } } });

    return PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () =>
        fluidFileConverter.execute(container, options));
}
