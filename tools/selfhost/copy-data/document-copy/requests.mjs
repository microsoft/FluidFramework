/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SAFE_SERVICE_CODES } from "../configuration/errors.mjs";
import { retry } from "../configuration/retry.mjs";

export class CopyError extends Error {
	constructor(message, status, endpoint, reason = "invalid-summary", metadata = {}) {
		super(message);
		this.name = "CopyError";
		Object.assign(this, { status, endpoint, reason, ...metadata });
	}
}

const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);
const transientCodes = new Set([
	"ETIMEDOUT",
	"ECONNRESET",
	"ECONNREFUSED",
	"EAI_AGAIN",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_BODY_TIMEOUT",
	"UND_ERR_SOCKET",
]);

async function readJson(response, maxBytes, endpoint, metrics) {
	const length = Number(response.headers?.get("content-length"));
	if (length > maxBytes) {
		await response.body?.cancel();
		throw new CopyError(
			"Response exceeds --max-summary-mib",
			undefined,
			endpoint,
			"payload-too-large",
		);
	}
	if (!response.body?.getReader) {
		// Lightweight test adapters may expose json() rather than a response stream.
		const value = await response.json();
		const bytes = Buffer.byteLength(JSON.stringify(value));
		if (bytes > maxBytes)
			throw new CopyError(
				"Response exceeds --max-summary-mib",
				undefined,
				endpoint,
				"payload-too-large",
			);
		metrics?.bytes(bytes);
		return value;
	}
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > maxBytes) {
				await reader.cancel();
				throw new CopyError(
					"Response exceeds --max-summary-mib",
					undefined,
					endpoint,
					"payload-too-large",
				);
			}
			chunks.push(value);
		}
		metrics?.bytes(bytes);
		return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
	} finally {
		reader.releaseLock();
	}
}

function retryAfter(response) {
	const value = response.headers?.get("retry-after");
	if (!value) return 0;
	const seconds = Number(value);
	const milliseconds = Number.isFinite(seconds)
		? seconds * 1000
		: Date.parse(value) - Date.now();
	return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
}

async function httpError(response, endpoint) {
	let reason =
		response.status === 401 || response.status === 403
			? "authentication"
			: response.status === 404
				? "not-found"
				: response.status === 429
					? "throttled"
					: response.status === 408
						? "timeout"
						: response.status >= 500
							? "server-error"
							: response.status === 409
								? "conflict"
								: "http-error";
	let serviceCode;
	let detailsUnavailable = false;
	try {
		const body = await readJson(response, 4096, endpoint);
		const code = body?.error?.code ?? body?.code;
		if (SAFE_SERVICE_CODES.has(code)) serviceCode = code;
	} catch {
		// Retain the explicit HTTP failure even when its optional error details cannot be read.
		detailsUnavailable = true;
	}
	if (serviceCode === "DocumentDeleted" && [404, 410].includes(response.status))
		reason = "deleted";
	else if (
		[400, 404].includes(response.status) &&
		(serviceCode === "RepositoryNotFound" || serviceCode === "SummaryNotFound")
	)
		reason = "missing-summary";
	return new CopyError(
		`Copy API request failed with HTTP ${response.status}${detailsUnavailable ? " (service error code unavailable)" : ""}`,
		response.status,
		endpoint,
		reason,
		{
			serviceCode,
			retryAfterMs: retryAfter(response),
			retryable: transientStatuses.has(response.status) && serviceCode === undefined,
		},
	);
}

/** Mint authorization for each attempt and bound both network time and response bytes. */
export async function requestJson(
	url,
	authorization,
	endpoint,
	fetchImplementation,
	options = {},
) {
	const {
		expectedStatuses = [200],
		headers,
		parseBody = true,
		policy = {},
		metrics,
		onAttempt,
		stage = endpoint,
		maxBytes = 64 * 1024 ** 2,
		...requestOptions
	} = options;
	return retry(
		async (attempt) => {
			let httpStatus;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), policy.timeoutMs ?? 45_000);
			const aborted = new Promise((_, reject) => {
				controller.signal.addEventListener(
					"abort",
					() =>
						reject(
							new CopyError("Copy API request timed out", undefined, endpoint, "timeout", {
								retryable: true,
							}),
						),
					{ once: true },
				);
			});
			const perform = async () => {
				const response = await fetchImplementation(url, {
					...requestOptions,
					signal: controller.signal,
					headers: { Authorization: authorization(), ...headers },
				});
				if (!response || !Number.isInteger(response.status))
					throw new CopyError(
						"Copy API response did not include an HTTP status",
						undefined,
						endpoint,
					);
				httpStatus = response.status;
				if (!expectedStatuses.includes(response.status))
					throw await httpError(response, endpoint);
				if (!parseBody) {
					await response.body?.cancel();
					return { status: response.status };
				}
				return readJson(response, maxBytes, endpoint, metrics);
			};
			try {
				const operation = () => Promise.race([perform(), aborted]);
				const value = await (metrics ? metrics.measure(stage, operation) : operation());
				onAttempt?.({ stage, attempt, httpStatus, outcome: "success" });
				return value;
			} catch (error) {
				if (error instanceof CopyError) {
					error.status ??= httpStatus;
					error.attempts = attempt;
					onAttempt?.({ stage, attempt, httpStatus, outcome: error.reason });
					throw error;
				}
				const code = error?.cause?.code ?? error?.code;
				const transient = transientCodes.has(code);
				onAttempt?.({
					stage,
					attempt,
					httpStatus,
					outcome: transient ? "network" : "invalid-summary",
				});
				throw new CopyError(
					transient ? "Copy API transport failed" : "Copy API response could not be read",
					httpStatus,
					endpoint,
					transient ? "network" : "invalid-summary",
					{ retryable: transient, attempts: attempt },
				);
			} finally {
				clearTimeout(timeout);
			}
		},
		{ ...policy, onRetry: () => metrics?.retry() },
	);
}
