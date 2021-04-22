/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Wrapper for JSON.parse to translate all exception to return undefined
 *
 * @param json - the JSON string to parse
 * @returns the result JSON.parse is successful, undefined if exception happens
 */
export function safelyParseJSON(json: string) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        //
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return parsed;
}
