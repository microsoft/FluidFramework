/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { PerformanceEvent } from "@fluidframework/telemetry-utils/internal";

import { isCodeLoaderBundle, isFluidFileConverter } from "./codeLoaderBundle.js";
import { IExportFileResponse, createContainerAndExecute } from "./exportFile.js";
/* eslint-disable import/no-internal-modules */
import { ITelemetryOptions } from "./logger/fileLogger.js";
import { createLogger, getTelemetryFileValidationError } from "./logger/loggerUtils.js";
/* eslint-enable import/no-internal-modules */
import { getArgsValidationError, getSnapshotFileContent } from "./utils.js";

const clientArgsValidationError = "Client_ArgsValidationError";

/**
 * Parse a provided JS bundle, execute code on Container based on ODSP snapshot, and write result to file
 * @param codeLoader - path to provided JS bundle that implements ICodeLoaderBundle (see codeLoaderBundle.ts)
 * @internal
 */
export async function parseBundleAndExportFile(
	codeLoader: string,
	inputFile: string,
	outputFile: string,
	telemetryFile: string,
	options?: string,
	telemetryOptions?: ITelemetryOptions,
	timeout?: number,
	disableNetworkFetch?: boolean,
): Promise<IExportFileResponse> {
	const telemetryArgError = getTelemetryFileValidationError(telemetryFile);
	if (telemetryArgError) {
		const eventName = clientArgsValidationError;
		return { success: false, eventName, errorMessage: telemetryArgError };
	}
	const { fileLogger, logger } = createLogger(telemetryFile, telemetryOptions);

	try {
		return await PerformanceEvent.timedExecAsync(
			logger,
			{ eventName: "ParseBundleAndExportFile" },
			async () => {
				// codeLoader is expected to be a file path. On Windows this also requires
				// explicit file: protocol for absolute paths. Otherwise, path starting with
				// a driver letter like 'c:" will have drive interpreted as URL protocol.
				// file:// URLs are always absolute so prepend file:// exactly when absolute.
				const codeLoaderSpec = `${path.isAbsolute(codeLoader) ? "file://" : ""}${codeLoader}`;
				const codeLoaderBundle = await import(codeLoaderSpec);
				if (!isCodeLoaderBundle(codeLoaderBundle)) {
					const eventName = clientArgsValidationError;
					const errorMessage = "Code loader bundle is not of type ICodeLoaderBundle";
					logger.sendErrorEvent({ eventName, message: errorMessage });
					return { success: false, eventName, errorMessage };
				}

				const fluidExport = await codeLoaderBundle.fluidExport;
				if (!isFluidFileConverter(fluidExport)) {
					const eventName = clientArgsValidationError;
					const errorMessage =
						"Fluid export from CodeLoaderBundle is not of type IFluidFileConverter";
					logger.sendErrorEvent({ eventName, message: errorMessage });
					return { success: false, eventName, errorMessage };
				}

				const argsValidationError = getArgsValidationError(inputFile, outputFile, timeout);
				if (argsValidationError) {
					const eventName = clientArgsValidationError;
					logger.sendErrorEvent({ eventName, message: argsValidationError });
					return { success: false, eventName, errorMessage: argsValidationError };
				}

				fs.writeFileSync(
					outputFile,
					await createContainerAndExecute(
						getSnapshotFileContent(inputFile),
						fluidExport,
						logger,
						options,
						timeout,
						disableNetworkFetch,
					),
				);

				return { success: true };
			},
		);
	} catch (error) {
		const eventName = "Client_UnexpectedError";
		logger.sendErrorEvent({ eventName }, error);
		return { success: false, eventName, errorMessage: "Unexpected error", error };
	} finally {
		await fileLogger.close();
	}
}
