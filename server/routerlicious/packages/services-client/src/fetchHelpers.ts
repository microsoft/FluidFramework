/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FetchFn, RawRequestHeaders } from "./fetchTypes";

/**
 * Combines multiple AbortSignals into a single signal that aborts when any of the input signals abort.
 * Polyfill for `AbortSignal.any()` which requires newer TypeScript lib targets.
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
	const controller = new AbortController();
	for (const signal of signals) {
		if (signal.aborted) {
			controller.abort(signal.reason);
			return controller.signal;
		}
		signal.addEventListener("abort", () => controller.abort(signal.reason), {
			once: true,
			signal: controller.signal,
		});
	}
	return controller.signal;
}

/**
 * Concatenates a base URL and a path, handling slashes.
 * @internal
 */
export function buildFetchUrl(baseURL: string | undefined, url: string | undefined): string {
	if (!baseURL) {
		return url ?? "";
	}
	if (!url) {
		return baseURL;
	}
	const base = baseURL.endsWith("/") ? baseURL.slice(0, -1) : baseURL;
	const path = url.startsWith("/") ? url : `/${url}`;
	return `${base}${path}`;
}

/**
 * Converts `RawRequestHeaders` to a `Record<string, string>` suitable for fetch's HeadersInit.
 */
export function toHeadersInit(headers: RawRequestHeaders): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		result[key] = String(value);
	}
	return result;
}

/**
 * Parses a fetch Response. Returns JSON if content-type is application/json, otherwise text.
 */
export async function parseFetchResponse<T>(response: Response): Promise<T> {
	const contentType = response.headers.get("content-type");
	if (contentType?.includes("application/json")) {
		return response.json() as Promise<T>;
	}
	return response.text() as unknown as T;
}

/**
 * Wraps a fetch call with a timeout using AbortController + setTimeout.
 * Uses `AbortSignal.any()` to combine with any existing signal in the init.
 */
export async function fetchWithTimeout(
	fetchFn: FetchFn,
	url: string,
	init: RequestInit,
	timeoutMs: number | undefined,
	timeoutMessage?: string,
): Promise<Response> {
	if (timeoutMs === undefined) {
		return fetchFn(url, init);
	}

	const timeoutController = new AbortController();
	const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

	const signals: AbortSignal[] = [timeoutController.signal];
	if (init.signal) {
		signals.push(init.signal);
	}

	try {
		return await fetchFn(url, {
			...init,
			signal: combineAbortSignals(signals),
		});
	} catch (error: unknown) {
		if (timeoutController.signal.aborted && error instanceof DOMException) {
			const message =
				timeoutMessage ?? `Timeout of ${timeoutMs}ms exceeded`;
			throw new Error(message);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

/**
 * Creates a wrapped `FetchFn` that adds an abort signal to every request.
 * Replaces `setupAxiosInterceptorsForAbortSignals`.
 * @internal
 */
export function createFetchWithAbortSignal(
	fetchFn: FetchFn,
	getAbortController: () => AbortController | undefined,
): FetchFn {
	return (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const abortController = getAbortController();
		if (!abortController) {
			return fetchFn(url, init);
		}

		const signals: AbortSignal[] = [abortController.signal];
		if (init?.signal) {
			signals.push(init.signal);
		}

		return fetchFn(url, {
			...init,
			signal: combineAbortSignals(signals),
		});
	};
}
