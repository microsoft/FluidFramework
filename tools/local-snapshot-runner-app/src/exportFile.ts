/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Loader } from "@fluidframework/container-loader";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerPackageInfo, IResolvedUrl, IUrlResolver, } from "@fluidframework/driver-definitions";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import * as fs from "fs";
import FileLogger from "./logger/FileLogger";
import { getArgsValidationError } from "./getArgsValidationError";
import { convertFluidFile } from "./convertFluidFile";
import { isCodeLoaderBundle } from "./codeLoaderBundle";

class SampleUrlResolver implements IUrlResolver {

    public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
        return undefined;
    }

    public async getAbsoluteUrl(
        resolvedUrl: IResolvedUrl,
        relativeUrl: string,
        packageInfoSource?: IContainerPackageInfo,
    ): Promise<string> {
        return "";
    }
}

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
        const inputFileContent = fs.readFileSync(inputFile);
        const outputFileContent = convertFluidFile(inputFileContent.toString(), scenario, logger);

        const loader = new Loader({
            urlResolver: new SampleUrlResolver(), // TODO
            documentServiceFactory: createLocalOdspDocumentServiceFactory(inputFileContent),
            codeLoader: await codeLoaderBundle.getCodeLoader(),
        });

        // for blobs or images, will have to output multiple files
        fs.appendFileSync(outputFolder + "/index.html", outputFileContent);

        logger.sendTelemetryEvent({ eventName: "Client_ExportCompleted" });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.sendErrorEvent({ eventName: "Client_UnknownError", message: error.message }, error);
    }
}
