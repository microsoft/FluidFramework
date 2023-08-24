/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties, IThrottlingWarning } from "@fluidframework/core-interfaces";
import { ContainerErrorTypes } from "@fluidframework/container-definitions";
import {
	IFluidErrorBase,
	ITelemetryLoggerExt,
	LoggingError,
	wrapErrorAndLog,
} from "@fluidframework/telemetry-utils";

/**
 * Warning emitted when requests to storage are being throttled.
 *
 * @deprecated
 *
 * This type is not intended for external use and is being removed from library exports.
 * No replacement API is intended.
 */
export class ThrottlingWarning extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.throttlingError;

	private constructor(
		message: string,
		readonly retryAfterSeconds: number,
		props?: ITelemetryProperties,
	) {
		super(message, props);
	}

	/**
	 * Wrap the given error as a ThrottlingWarning
	 * Only preserves the error message, and applies the given retry after to the new warning object
	 */
	static wrap(
		error: unknown,
		retryAfterSeconds: number,
		logger: ITelemetryLoggerExt,
	): IThrottlingWarning {
		const newErrorFn = (errMsg: string) => new ThrottlingWarning(errMsg, retryAfterSeconds);
		return wrapErrorAndLog(error, newErrorFn, logger);
	}
}

/**
 * Error indicating that a client's session has reached its time limit and is closed.
 *
 * @deprecated
 *
 * This type is not intended for external use and is being removed from library exports.
 * No replacement API is intended.
 */
export class ClientSessionExpiredError extends LoggingError implements IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.clientSessionExpiredError;

	constructor(message: string, readonly expiryMs: number) {
		super(message, { timeoutMs: expiryMs });
	}
}
