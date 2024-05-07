/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Wrapper for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse},
 * which will return `undefined` in the case of an error, rather than throwing.
 *
 * @param json - The JSON string to parse
 * @returns The result from `JSON.parse` if successful, otherwise `undefined`.
 *
 * @deprecated Moved to the `@fluidframework/core-utils` package.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safelyParseJSON(json: string): any | undefined {
	let parsed;
	try {
		parsed = JSON.parse(json);
	} catch {
		return undefined;
	}
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return parsed;
}
