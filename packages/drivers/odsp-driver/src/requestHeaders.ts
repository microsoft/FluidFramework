/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const driverOwnedHeaderNames = new Set([
	"authorization",
	"content-type",
	"x-fluid-epoch",
	"x-http-method-override",
	"x-requeststats",
]);

/**
 * Creates an immutable snapshot of host-provided per-session headers after removing names owned by
 * the ODSP driver. The factory, URL resolver, epoch tracker, and Socket.IO connection use the
 * returned value so later host mutations cannot change an active document session or override
 * authentication and protocol headers.
 */
export function copyRequestHeaders(
	requestHeaders: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
	if (requestHeaders === undefined || Object.keys(requestHeaders).length === 0) {
		return undefined;
	}
	const copiedHeaders = Object.fromEntries(
		Object.entries(requestHeaders).filter(
			([name]) => !driverOwnedHeaderNames.has(name.toLowerCase()),
		),
	);
	return Object.keys(copiedHeaders).length === 0 ? undefined : Object.freeze(copiedHeaders);
}

/**
 * Adds sanitized host headers to one ODSP request. Request-specific headers are applied last, so
 * driver-generated values win case-insensitive collisions. ODSP fetch paths use this helper for
 * snapshot, delta, blob, share-link, file-link, and version requests; Socket.IO applies the copied
 * headers separately as Node.js `extraHeaders`.
 */
export function mergeRequestHeaders(
	hostHeaders: Readonly<Record<string, string>> | undefined,
	requestHeaders: HeadersInit | undefined,
): HeadersInit | undefined {
	const safeHostHeaders = copyRequestHeaders(hostHeaders);
	if (safeHostHeaders === undefined) {
		return requestHeaders;
	}

	const merged = new Headers(safeHostHeaders);
	if (requestHeaders !== undefined) {
		for (const [key, value] of new Headers(requestHeaders)) {
			merged.set(key, value);
		}
	}
	return Object.fromEntries(merged);
}
