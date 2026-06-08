/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	loadExistingContainer,
	waitContainerToCatchUp,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { createLocalOdspDocumentServiceFactory } from "@fluidframework/odsp-driver/internal";
import { createChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils/internal";

import type { IFluidFileConverter } from "./codeLoaderBundle.js";
import { FakeUrlResolver } from "./fakeUrlResolver.js";
/* eslint-disable import-x/no-internal-modules */
import type { IFileLoggerTelemetryOptions } from "./logger/fileLogger.js";
import {
	createFluidRunnerLogger,
	getTelemetryFileValidationError,
} from "./logger/loggerUtils.js";
import { getArgsValidationError, getSnapshotFileContent, timeoutPromise } from "./utils.js";
/* eslint-enable import-x/no-internal-modules */

/**
 * @legacy @beta
 */
export type IExportFileResponse = IExportFileResponseSuccess | IExportFileResponseFailure;

/**
 * @legacy @beta
 */
export interface IExportFileResponseSuccess {
	success: true;
}

/**
 * @legacy @beta
 */
export interface IExportFileResponseFailure {
	success: false;
	eventName: string;
	errorMessage: string;
	error?: any;
}

const clientArgsValidationError = "Client_ArgsValidationError";

/**
 * Execute code on a Fluid {@link @fluidframework/container-definitions#IContainer} loaded from an ODSP snapshot
 * file and write the resulting string to disk.
 * @internal
 */
export async function exportFile(
	fluidFileConverter: IFluidFileConverter,
	inputFile: string,
	outputFile: string,
	telemetryFile: string,
	options?: string,
	telemetryOptions?: IFileLoggerTelemetryOptions,
	timeout?: number,
	disableNetworkFetch?: boolean,
): Promise<IExportFileResponse> {
	const telemetryArgError = getTelemetryFileValidationError(telemetryFile);
	if (telemetryArgError) {
		const eventName = clientArgsValidationError;
		return { success: false, eventName, errorMessage: telemetryArgError };
	}
	const { fileLogger, logger: baseLogger } = createFluidRunnerLogger(
		telemetryFile,
		telemetryOptions,
	);
	const logger = createChildLogger({ logger: baseLogger });

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
					await createFluidRunnerContainerAndExecute(
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
 * Create a Fluid {@link @fluidframework/container-definitions#IContainer} from an ODSP snapshot and run
 * caller-provided code against it.
 *
 * @remarks
 * The container is loaded with `opsBeforeReturn: "cached"` and {@link @fluidframework/container-loader#waitContainerToCatchUp}
 * is invoked before {@link IFluidFileConverter.execute} runs. The container is disposed once `execute` resolves
 * (or rejects).
 *
 * @param localOdspSnapshot - The ODSP snapshot to load the container from. May be either the JSON snapshot
 * as a string or the binary snapshot as a `Uint8Array`.
 * @param fluidFileConverter - Caller-provided code loader and execution logic. See {@link IFluidFileConverter}.
 * @param baseLogger - Telemetry logger that will receive events emitted during load and execution. Typically
 * obtained from {@link createFluidRunnerLogger}.
 * @param options - Opaque, caller-defined string passed through to {@link IFluidFileConverter.execute}.
 * @param timeout - Optional timeout in milliseconds. If the operation does not complete within this period
 * the returned promise rejects. When omitted, no timeout is applied.
 * @param disableNetworkFetch - When `true`, replaces `global.fetch` with an implementation that throws,
 * ensuring the container load is fully serviced from the provided snapshot. Defaults to `false`.
 * @returns The string result returned by {@link IFluidFileConverter.execute}.
 *
 * @legacy
 * @beta
 */
export async function createFluidRunnerContainerAndExecute(
	localOdspSnapshot: string | Uint8Array,
	fluidFileConverter: IFluidFileConverter,
	baseLogger: ITelemetryBaseLogger,
	options?: string,
	timeout?: number,
	disableNetworkFetch: boolean = false,
): Promise<string> {
	const logger = createChildLogger({ logger: baseLogger });
	const fn = async (): Promise<string> => {
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
		await waitContainerToCatchUp(container);

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
