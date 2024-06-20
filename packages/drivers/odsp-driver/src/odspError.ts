/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils/internal";
import { OdspError, OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";
import {
	IFluidErrorBase,
	getCircularReplacer,
} from "@fluidframework/telemetry-utils/internal";

import { IOdspSocketError } from "./contracts.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromSocketError(
	socketError: IOdspSocketError,
	handler: string,
): IFluidErrorBase & OdspError {
	// Make sure we always return something, and do not throw.
	try {
		// pre-0.58 error message prefix: OdspSocketError
		const message = `ODSP socket error (${handler}): ${socketError.message}`;
		const error = createOdspNetworkError(
			message,
			socketError.code,
			socketError.retryAfter,
			undefined, // response from http request
			socketError.error
				? JSON.stringify({ error: socketError.error }, getCircularReplacer())
				: undefined, // responseText
		);

		error.addTelemetryProperties({
			odspError: true,
			relayServiceError: true,
			scenarioName: handler,
		});
		return error;
	} catch {
		return new NonRetryableError(
			"Internal error: errorObjectFromSocketError",
			OdspErrorTypes.fileNotFoundOrAccessDeniedError,
			{ driverVersion },
		);
	}
}
