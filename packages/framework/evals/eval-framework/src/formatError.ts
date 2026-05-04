/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Walk the cause chain and format each level with its full stack trace.
 * Produces a single string with levels joined by "Caused by: ".
 * @legacy
 * @alpha
 */
export function formatError(err: unknown): string {
	const parts: string[] = [];
	let current: unknown = err;
	while (current instanceof Error) {
		parts.push(current.stack ?? current.message);
		current = (current as NodeJS.ErrnoException).cause;
	}
	if (current !== undefined && current !== null) {
		if (typeof current === "object") {
			parts.push(JSON.stringify(current));
		} else {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string -- non-Error cause is a primitive; String() is safe here
			parts.push(String(current));
		}
	}
	return parts.join("\nCaused by: ");
}
