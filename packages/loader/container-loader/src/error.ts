/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { IThrottlingWarning } from "@fluidframework/core-interfaces/internal";
import {
	IFluidErrorBase,
	ITelemetryLoggerExt,
	LoggingError,
	wrapErrorAndLog,
} from "@fluidframework/telemetry-utils/internal";

/**
 * Warning emitted when requests to storage are being throttled.
 */
export class ThrottlingWarning
	extends LoggingError
	implements IThrottlingWarning, IFluidErrorBase
{
	/**
	 * {@inheritDoc @fluidframework/telemetry-utils#IFluidErrorBase.errorType}
	 */
	public readonly errorType = ContainerErrorTypes.throttlingError;

	private constructor(
		message: string,
		readonly retryAfterSeconds: number,
		props?: ITelemetryBaseProperties,
	) {
		super(message, props);
	}

	/**
	 * Wrap the given error as a ThrottlingWarning
	 * Only preserves the error message, and applies the given retry after to the new warning object
	 */
	public static wrap(
		error: unknown,
		retryAfterSeconds: number,
		logger: ITelemetryLoggerExt,
	): IThrottlingWarning {
		const newErrorFn = (errMsg: string): ThrottlingWarning =>
			new ThrottlingWarning(errMsg, retryAfterSeconds);
		return wrapErrorAndLog(error, newErrorFn, logger);
	}
}
