/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Wrapper for
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse | JSON.parse}
 * to translate all exception to return undefined
 *
 * @param json - The JSON string to parse
 * @returns The result from `JSON.parse` if successful, otherwise `undefined`.
 */
export function safelyParseJSON(json: string) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        // No-op
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return parsed;
}
