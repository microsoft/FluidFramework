/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const FAILURE_REASONS = new Set(["network", "http-error", "internal-error", "az-cli-error", "timeout"]);

/** Classify an error without retaining its message or stack. */
export function classifyError(error) {
	if (error?.name === "AbortError" || error?.code === "ETIMEDOUT") return "timeout";
	if (typeof error?.statusCode === "number" || typeof error?.status === "number") return "http-error";
	if (typeof error?.code === "string" && error.code.startsWith("E")) return "network";
	if (error?.name === "CredentialError" || error?.name === "AzError") return "az-cli-error";
	return "internal-error";
}

/** Create a non-sensitive failure result. */
export function createFailure(documentId, stage, error) {
	const reason = classifyError(error);
	const status = error?.statusCode ?? error?.status;
	return {
		documentId,
		stage,
		reason: FAILURE_REASONS.has(reason) ? reason : "internal-error",
		...(typeof status === "number" ? { httpStatus: status } : {}),
	};
}
