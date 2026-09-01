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
