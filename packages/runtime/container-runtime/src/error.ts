/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerErrorTypes } from "@fluidframework/container-definitions";
import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils";

/**
 * Error indicating that a client's session has reached its time limit and is closed.
 */
export class ClientSessionExpiredError extends LoggingError implements IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.clientSessionExpiredError;

	constructor(message: string, readonly expiryMs: number) {
		super(message, { timeoutMs: expiryMs });
	}
}
