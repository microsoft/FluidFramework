/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerErrorTypes } from "@fluidframework/container-definitions/internal";
import type { IFluidErrorBase } from "@fluidframework/telemetry-utils/internal";
import { LoggingError } from "@fluidframework/telemetry-utils/internal";

/**
 * Error indicating that a client's session has reached its time limit and is closed.
 */
export class ClientSessionExpiredError extends LoggingError implements IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.clientSessionExpiredError;

	constructor(
		message: string,
		readonly expiryMs: number,
	) {
		super(message, { timeoutMs: expiryMs });
	}
}
