/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Indent text by prepending spaces.
 */
export function indentString(str: string, indentNumber = 2): string {
    const ind = getIndent(indentNumber);
    return `${ind}${str}`;
}

/**
 * Returns a string of spaces.
 */
export function getIndent(indentNumber = 2) {
    return " ".repeat(indentNumber);
}
