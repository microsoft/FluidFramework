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
	"missing-self-host-document-id",
	"token-generation-failed",
	"azure-fluid-relay-discovery-token-generation-failed",
	"azure-fluid-relay-historian-token-generation-failed",
	"invalid-discovery-endpoint",
	"unexpected-azure-fluid-relay-discovery",
	"unexpected-azure-fluid-relay-ref-read",
	"unexpected-azure-fluid-relay-summary-read",
	"unexpected-summary-conversion",
	"unexpected-self-host-create",
	"unexpected-self-host-response-validation",
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
		...(new Set(["azure-fluid-relay-discovery", "azure-fluid-relay-historian", "self-host"]).has(error?.endpoint) ? { endpoint: error.endpoint } : fallback.endpoint === undefined ? {} : { endpoint: fallback.endpoint }),
	};
}
