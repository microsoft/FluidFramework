/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Error information transferred from a worker back to the main thread.
 *
 * @remarks
 * Process based workers communicate over IPC, which does not preserve `Error` instances, so errors
 * are copied field by field. Values that are thrown but are not `Error`s leave every field
 * `undefined`.
 */
export interface WorkerError {
	name?: string | undefined;
	message?: string | undefined;
	stack?: string | undefined;
}

export function serializeWorkerError(value: unknown): WorkerError {
	if (typeof value !== "object" || value === null) {
		return {};
	}

	const error = value as Record<string, unknown>;
	return {
		name: typeof error["name"] === "string" ? error["name"] : undefined,
		message: typeof error["message"] === "string" ? error["message"] : undefined,
		stack: typeof error["stack"] === "string" ? error["stack"] : undefined,
	};
}
