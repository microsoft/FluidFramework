/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

/**
 * Contract for logger that writes telemetry to a file
 * @internal
 */
export interface IFileLogger extends ITelemetryBaseLogger {
	/**
	 * This method acts as a "dispose" and should be explicitly called at the end of execution
	 */
	close(): Promise<void>;
}

/**
 * Desired output format for the telemetry
 * @alpha
 */
export enum OutputFormat {
	JSON,
	CSV,
}

/* eslint-disable tsdoc/syntax */
/**
 * Options to provide upon creation of IFileLogger
 * @internal
 */
export interface ITelemetryOptions {
	/** Desired output format used to create a specific IFileLogger implementation */
	outputFormat?: OutputFormat;

	/**
	 * Properties that should be added to every telemetry event
	 *
	 * @example
	 *
	 * ```JSON
	 * { "prop1": "value1", "prop2": 10.0 }
	 * ```
	 */
	defaultProps?: Record<string, string | number>;

	/** Number of telemetry events per flush to telemetry file */
	eventsPerFlush?: number;
}
/* eslint-enable tsdoc/syntax */
