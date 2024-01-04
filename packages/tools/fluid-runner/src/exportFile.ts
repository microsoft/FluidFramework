/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { ITelemetryLoggerExt, PerformanceEvent } from "@fluidframework/telemetry-utils";
import { LoaderHeader } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver";
import { IFluidFileConverter } from "./codeLoaderBundle";
import { FakeUrlResolver } from "./fakeUrlResolver";
import { getSnapshotFileContent, timeoutPromise, getArgsValidationError } from "./utils";
/* eslint-disable import/no-internal-modules */
import { ITelemetryOptions } from "./logger/fileLogger";
import { createLogger, getTelemetryFileValidationError } from "./logger/loggerUtils";
/* eslint-enable import/no-internal-modules */

/**
 * @alpha
 */
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
 * @internal
 */
export async function exportFile(
	fluidFileConverter: IFluidFileConverter,
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
			{ eventName: "ExportFile" },
			async () => {
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
						fluidFileConverter,
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

/**
 * Create the container based on an ODSP snapshot and execute code on it
 * @returns result of execution
 * @internal
 */
export async function createContainerAndExecute(
	localOdspSnapshot: string | Uint8Array,
	fluidFileConverter: IFluidFileConverter,
	logger: ITelemetryLoggerExt,
	options?: string,
	timeout?: number,
	disableNetworkFetch: boolean = false,
): Promise<string> {
	const fn = async () => {
		if (disableNetworkFetch) {
			global.fetch = async () => {
				throw new Error("Network fetch is not allowed");
			};
		}

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
			try {
				return await fluidFileConverter.execute(container, options);
			} finally {
				container.dispose();
			}
		});
	};

	// eslint-disable-next-line unicorn/prefer-ternary
	if (timeout !== undefined) {
		return timeoutPromise<string>((resolve, reject) => {
			fn()
				.then((value) => resolve(value))
				.catch((error) => reject(error));
		}, timeout);
	} else {
		return fn();
	}
}
