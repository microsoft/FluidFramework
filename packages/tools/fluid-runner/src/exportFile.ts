/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

import {
	DisconnectReason,
	LoaderHeader,
} from "@fluidframework/container-definitions/internal";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver/internal";
import {
	ITelemetryLoggerExt,
	PerformanceEvent,
} from "@fluidframework/telemetry-utils/internal";

import { IFluidFileConverter } from "./codeLoaderBundle.js";
import { FakeUrlResolver } from "./fakeUrlResolver.js";
/* eslint-disable import/no-internal-modules */
import { ITelemetryOptions } from "./logger/fileLogger.js";
import { createLogger, getTelemetryFileValidationError } from "./logger/loggerUtils.js";
import { getArgsValidationError, getSnapshotFileContent, timeoutPromise } from "./utils.js";
/* eslint-enable import/no-internal-modules */

/**
 * @legacy
 * @alpha
 */
export type IExportFileResponse = IExportFileResponseSuccess | IExportFileResponseFailure;

/**
 * @legacy
 * @alpha
 */
export interface IExportFileResponseSuccess {
	success: true;
}

/**
 * @legacy
 * @alpha
 */
export interface IExportFileResponseFailure {
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

		const loaderProps: ILoaderProps = {
			urlResolver: new FakeUrlResolver(),
			documentServiceFactory: createLocalOdspDocumentServiceFactory(localOdspSnapshot),
			codeLoader: await fluidFileConverter.getCodeLoader(logger),
			scope: await fluidFileConverter.getScope?.(logger),
			logger,
		};

		const container = await loadExistingContainer({
			...loaderProps,
			request: {
				url: "/fakeUrl/",
				headers: {
					[LoaderHeader.loadMode]: { opsBeforeReturn: "cached" },
				},
			},
		});

		return PerformanceEvent.timedExecAsync(logger, { eventName: "ExportFile" }, async () => {
			try {
				return await fluidFileConverter.execute(container, options);
			} finally {
				container.dispose(DisconnectReason.Expected);
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
