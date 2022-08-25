/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import path from "path";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { getArgsValidationError } from "./getArgsValidationError";
import { IFluidFileConverter, isCodeLoaderBundle, isFluidFileConverter } from "./codeLoaderBundle";
import { FakeUrlResolver } from "./fakeUrlResolver";

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

export async function exportFile(
    codeLoader: string,
    inputFile: string,
    outputFolder: string,
    scenario: string,
    logger: ITelemetryLogger,
): Promise<IExportFileResponse> {
    try {
        return await PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () => {
            const argsValidationError = getArgsValidationError(inputFile, outputFolder, scenario);
            if (argsValidationError) {
                const eventName = clientArgsValidationError;
                return { success: false, eventName, errorMessage: argsValidationError };
            }

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

            // TODO: read file stream
            const inputFileContent = fs.readFileSync(inputFile, { encoding: "utf-8" });

            const results = await createContainerAndExecute(
                inputFileContent,
                fluidExport,
                scenario,
                logger,
            );

            // eslint-disable-next-line guard-for-in, no-restricted-syntax
            for (const key in results) {
                fs.appendFileSync(path.join(outputFolder, key), results[key]);
            }

            return { success: true };
        });
    } catch (error) {
        const eventName = "Client_UnexpectedError";
        return { success: false, eventName, errorMessage: "Unexpected error", error };
    }
}

export async function createContainerAndExecute(
    localOdspSnapshot: string,
    fluidFileConverter: IFluidFileConverter,
    scenario: string,
    logger: ITelemetryLogger,
): Promise<Record<string, string>> {
    const loader = new Loader({
        urlResolver: new FakeUrlResolver(),
        documentServiceFactory: createLocalOdspDocumentServiceFactory(localOdspSnapshot),
        codeLoader: fluidFileConverter.codeLoader,
        scope: fluidFileConverter.scope,
        logger,
    });

    const container = await loader.resolve({ url: "/fakeUrl/", headers: {
        [LoaderHeader.loadMode]: { opsBeforeReturn: "cached" } } });

    return PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () =>
        fluidFileConverter.execute(container, scenario, logger));
}
