/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { isCodeLoaderBundle, isFluidFileConverter } from "./codeLoaderBundle";
import { createContainerAndExecute, IExportFileResponse } from "./exportFile";
import { getArgsValidationError } from "./getArgsValidationError";
/* eslint-disable import/no-internal-modules */
import { ITelemetryOptions } from "./logger/fileLogger";
import { createLogger, getTelemetryFileValidationError } from "./logger/loggerUtils";
/* eslint-enable import/no-internal-modules */
import { getSnapshotFileContent } from "./utils";

const clientArgsValidationError = "Client_ArgsValidationError";

/**
 * Parse a provided JS bundle, execute code on Container based on ODSP snapshot, and write result to file
 * @param codeLoader - path to provided JS bundle that implements ICodeLoaderBundle (see codeLoaderBundle.ts)
 */
export async function parseBundleAndExportFile(
    codeLoader: string,
    inputFile: string,
    outputFile: string,
    telemetryFile: string,
    options?: string,
    telemetryOptions?: ITelemetryOptions,
): Promise<IExportFileResponse> {
    const telemetryArgError = getTelemetryFileValidationError(telemetryFile);
    if (telemetryArgError) {
        const eventName = clientArgsValidationError;
        return { success: false, eventName, errorMessage: telemetryArgError };
    }
    const { fileLogger, logger } = createLogger(telemetryFile, telemetryOptions);

    try {
        return await PerformanceEvent.timedExecAsync(logger, { eventName: "ParseBundleAndExportFile" }, async () => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            const codeLoaderBundle = require(codeLoader);
            if (!isCodeLoaderBundle(codeLoaderBundle)) {
                const eventName = clientArgsValidationError;
                const errorMessage = "Code loader bundle is not of type ICodeLoaderBundle";
                logger.sendErrorEvent({ eventName, message: errorMessage });
                return { success: false, eventName, errorMessage };
            }

            const fluidExport = await codeLoaderBundle.fluidExport;
            if (!isFluidFileConverter(fluidExport)) {
                const eventName = clientArgsValidationError;
                const errorMessage = "Fluid export from CodeLoaderBundle is not of type IFluidFileConverter";
                logger.sendErrorEvent({ eventName, message: errorMessage });
                return { success: false, eventName, errorMessage };
            }

            const argsValidationError = getArgsValidationError(inputFile, outputFile);
            if (argsValidationError) {
                const eventName = clientArgsValidationError;
                logger.sendErrorEvent({ eventName, message: argsValidationError });
                return { success: false, eventName, errorMessage: argsValidationError };
            }

            fs.writeFileSync(outputFile, await createContainerAndExecute(
                getSnapshotFileContent(inputFile),
                fluidExport,
                logger,
                options,
            ));

            return { success: true };
        });
    } catch (error) {
        const eventName = "Client_UnexpectedError";
        logger.sendErrorEvent({ eventName }, error);
        return { success: false, eventName, errorMessage: "Unexpected error", error };
    } finally {
        await fileLogger.close();
    }
}
