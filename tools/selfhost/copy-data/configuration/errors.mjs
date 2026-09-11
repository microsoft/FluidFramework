/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const FAILURE_REASONS = new Set(["network", "http-error", "internal-error", "az-cli-error", "timeout"]);
const COPY_ENDPOINTS = new Set(["azure-fluid-relay-discovery", "azure-fluid-relay-historian", "self-host"]);

const SAFE_ERROR_NAMES = new Set(["AzError", "ConfigurationError", "ConfirmationError", "CopyError", "CredentialError"]);

/** Classify an error without retaining its message or stack. */
export function classifyError(error) {
	if (error?.name === "AbortError" || error?.code === "ETIMEDOUT") return "timeout";
	if (typeof error?.statusCode === "number" || typeof error?.status === "number") return "http-error";
	if (typeof error?.code === "string" && error.code.startsWith("E")) return "network";
	if (error?.name === "CredentialError" || error?.name === "AzError") return "az-cli-error";
	return "internal-error";
}

/** Create a non-sensitive failure result. */
export function createFailure(documentId, stage, error, fallback = {}) {
	const reason = classifyError(error);
	const status = error?.statusCode ?? error?.status;
	return {
		documentId,
		stage,
		reason: FAILURE_REASONS.has(reason) ? reason : "internal-error",
		...(typeof status === "number" ? { httpStatus: status } : {}),
		...(COPY_ENDPOINTS.has(error?.endpoint) ? { endpoint: error.endpoint } : fallback.endpoint === undefined ? {} : { endpoint: fallback.endpoint }),
	};
}

/** Return an error message only when it is a safe error type. */
export function safeErrorMessage(error) {
	return SAFE_ERROR_NAMES.has(error?.name) && typeof error.message === "string"
		? error.message
		: "An unexpected error occurred";
}

/** Log a safe error message and add it to a result error collection. */
export function logAndAddError(errors, error, failure, prefix) {
	const message = safeErrorMessage(error);
	console.error(`${prefix}: ${message}`);
	const result = { ...failure, message };
	errors.push(result);
	return result;
}
