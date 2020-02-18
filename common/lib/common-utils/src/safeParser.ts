/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
    return parsed;
}
