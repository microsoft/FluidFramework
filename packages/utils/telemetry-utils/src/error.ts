/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FluidErrorTypes,
	IGenericError,
	IErrorBase,
	ITelemetryProperties,
	IUsageError,
} from "@fluidframework/core-interfaces";

import { LoggingError } from "./errorLogging";
import { IFluidErrorBase } from "./fluidErrorBase";

/**
 * Generic wrapper for an unrecognized/uncategorized error object
 */
export class GenericError extends LoggingError implements IGenericError, IFluidErrorBase {
	readonly errorType = FluidErrorTypes.genericError;

	/**
	 * Create a new GenericError
	 * @param message - Error message
	 * @param error - inner error object
	 * @param props - Telemetry props to include when the error is logged
	 */
	constructor(message: string, readonly error?: any, props?: ITelemetryProperties) {
		// Don't try to log the inner error
		super(message, props, new Set(["error"]));
	}
}

/** Error indicating an API is being used improperly resulting in an invalid operation. */
export class UsageError extends LoggingError implements IUsageError, IFluidErrorBase {
	readonly errorType = FluidErrorTypes.usageError;

	constructor(message: string, props?: ITelemetryProperties) {
		super(message, { ...props, usageError: true });
	}
}

/**
 * DataCorruptionError indicates that we encountered definitive evidence that the data at rest
 * backing this container is corrupted, and this container would never be expected to load properly again
 */
export class DataCorruptionError extends LoggingError implements IErrorBase, IFluidErrorBase {
	readonly errorType = FluidErrorTypes.dataCorruptionError;
	readonly canRetry = false;

	constructor(message: string, props: ITelemetryProperties) {
		super(message, { ...props, dataProcessingError: 1 });
	}
}
