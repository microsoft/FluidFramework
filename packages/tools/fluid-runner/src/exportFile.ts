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
import { IFluidFileConverter } from "./codeLoaderBundle";
import { FakeUrlResolver } from "./fakeUrlResolver";
import { getSnapshotFileContent, timeoutPromise, getArgsValidationError } from "./utils";
/* eslint-disable import/no-internal-modules */
import { ITelemetryOptions } from "./logger/fileLogger";
import { createLogger, getTelemetryFileValidationError } from "./logger/loggerUtils";
/* eslint-enable import/no-internal-modules */

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
 * Execute code on Container based on ODSP snapshot and write result to file
 */
export async function exportFile(
	fluidFileConverter: IFluidFileConverter,
	inputFile: string,
	outputFile: string,
	telemetryFile: string,
	options?: string,
	telemetryOptions?: ITelemetryOptions,
	timeout: number = 60 * 60 * 1000, // hour timeout
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
			{ eventName: "ExportFile" },
			async () => {
				const argsValidationError = getArgsValidationError(inputFile, outputFile, timeout);
				if (argsValidationError) {
					const eventName = clientArgsValidationError;
					logger.sendErrorEvent({ eventName, message: argsValidationError });
					return { success: false, eventName, errorMessage: argsValidationError };
				}

				const executeResult = await timeoutPromise<string>((resolve, reject) => {
					createContainerAndExecute(
						getSnapshotFileContent(inputFile),
						fluidFileConverter,
						logger,
						options,
					)
						.then((value) => resolve(value))
						.catch((error) => reject(error));
				}, timeout);

				fs.writeFileSync(outputFile, executeResult);

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
		scope: await fluidFileConverter.getScope?.(logger),
		logger,
	});

	const container = await loader.resolve({
		url: "/fakeUrl/",
		headers: {
			[LoaderHeader.loadMode]: { opsBeforeReturn: "cached" },
		},
	});

	return PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () => {
		const result = await fluidFileConverter.execute(container, options);
		container.close();
		return result;
	});
}
