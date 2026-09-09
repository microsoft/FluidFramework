/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const FAILURE_REASONS = new Set(["network", "http-error", "internal-error", "az-cli-error", "timeout"]);
const TRANSFER_ERROR_CODES = new Set([
	"request-failed",
	"http-request-failed",
	"invalid-response",
	"missing-historian-url",
	"invalid-historian-url",
	"invalid-summary-entry",
	"unsupported-summary-entry",
	"missing-summary-blob-id",
	"missing-summary-blob",
	"invalid-summary-blob",
	"invalid-summary",
	"missing-protocol-metadata",
	"invalid-protocol-metadata",
	"incomplete-protocol-metadata",
	"missing-summary",
	"missing-target-document-id",
	"token-generation-failed",
	"source-discovery-token-generation-failed",
	"source-historian-token-generation-failed",
	"invalid-discovery-endpoint",
	"unexpected-source-discovery",
	"unexpected-source-ref-read",
	"unexpected-source-summary-read",
	"unexpected-summary-conversion",
	"unexpected-target-create",
	"unexpected-target-response-validation",
]);

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
		...(TRANSFER_ERROR_CODES.has(error?.code) ? { errorCode: error.code } : fallback.errorCode === undefined ? {} : { errorCode: fallback.errorCode }),
		...(typeof status === "number" ? { httpStatus: status } : {}),
		...(new Set(["source-discovery", "source-historian", "target"]).has(error?.endpoint) ? { endpoint: error.endpoint } : fallback.endpoint === undefined ? {} : { endpoint: fallback.endpoint }),
	};
}
