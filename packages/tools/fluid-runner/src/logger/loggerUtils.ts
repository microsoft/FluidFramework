/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { CSVFileLogger } from "./csvFileLogger.js";
import {
	type IFileLogger,
	type IFileLoggerTelemetryOptions,
	OutputFormat,
} from "./fileLogger.js";
import { JSONFileLogger } from "./jsonFileLogger.js";

/**
 * Create an {@link @fluidframework/core-interfaces#ITelemetryBaseLogger} wrapped around an {@link IFileLogger}
 * that writes telemetry events to the file at `filePath`.
 *
 * @remarks
 * All telemetry events should be sent through the returned `logger`. The returned `fileLogger` is the
 * underlying sink — its `close()` method must be called at the end of execution to flush any buffered
 * events to disk.
 *
 * If `options.outputFormat` is not supplied, telemetry is written as JSON. Use {@link OutputFormat.CSV}
 * to write CSV instead. See {@link IFileLoggerTelemetryOptions} for supported options including default properties
 * applied to every event and flush batching.
 *
 * @param filePath - Path to the file telemetry will be written to. Must not already exist.
 * @param options - Optional telemetry configuration. See {@link IFileLoggerTelemetryOptions}.
 * @returns The wrapped telemetry logger to send events through, and the underlying `IFileLogger`
 * which must be closed when telemetry collection is finished.
 *
 * @legacy
 * @beta
 */
export function createFluidRunnerLogger(
	filePath: string,
	options?: IFileLoggerTelemetryOptions,
): { logger: ITelemetryBaseLogger; fileLogger: IFileLogger } {
	const fileLogger =
		options?.outputFormat === OutputFormat.CSV
			? new CSVFileLogger(filePath, options?.eventsPerFlush, options?.defaultProps)
			: new JSONFileLogger(filePath, options?.eventsPerFlush, options?.defaultProps);

	const logger = createChildLogger({
		logger: fileLogger,
		namespace: "LocalSnapshotRunnerApp",
		properties: {
			all: { Event_Time: () => Date.now() },
		},
	});

	return { logger, fileLogger };
}

/**
 * Validate the telemetryFile command line argument
 * @param telemetryFile - path where telemetry will be written
 * @internal
 */
export function getTelemetryFileValidationError(telemetryFile: string): string | undefined {
	if (!telemetryFile) {
		return "Telemetry file argument is missing.";
	} else if (fs.existsSync(telemetryFile)) {
		return `Telemetry file already exists [${telemetryFile}].`;
	}

	return undefined;
}

/**
 * Validate the provided output format and default properties
 * @param format - desired output format of the telemetry
 * @param props - default properties to be added to every telemetry entry
 * @internal
 */
export function validateAndParseTelemetryOptions(
	format?: string,
	props?: (string | number)[],
	eventsPerFlush?: number,
):
	| { success: false; error: string }
	| { success: true; telemetryOptions: IFileLoggerTelemetryOptions } {
	let outputFormat: OutputFormat | undefined;
	const defaultProps: Record<string, string | number> = {};

	if (format) {
		outputFormat = OutputFormat[format];
		if (outputFormat === undefined) {
			return { success: false, error: `Invalid telemetry format [${format}]` };
		}
	}

	if (props && props.length > 0) {
		if (props.length % 2 !== 0) {
			return {
				success: false,
				error: `Invalid number of telemetry properties to add [${props.length}]`,
			};
		}
		for (let i = 0; i < props.length; i += 2) {
			if (typeof props[i] === "number") {
				return {
					success: false,
					error: `Property name cannot be number at index [${i}] -> [${props[i]}]`,
				};
			}
			defaultProps[props[i]] = props[i + 1];
		}
	}

	if (eventsPerFlush !== undefined && isNaN(eventsPerFlush)) {
		return {
			success: false,
			error: "Invalid eventsPerFlush",
		};
	}

	return { success: true, telemetryOptions: { outputFormat, defaultProps, eventsPerFlush } };
}
