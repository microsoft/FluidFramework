/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview implements a joinPaths routine to merge two paths.
 */

/**
 *
 * Helper functions for string processing
 */

/**
 * Merges two strings with a separator. If one of the two is empty no separator will be added.
 * No duplicated separators will be joined
 *
 * @param in_string1 - The first string to join
 * @param in_string2 - The second string to join
 * @param in_separator - The path separator
 *
 * @returns The joined path
 */
export function joinPaths(in_string1: string = "", in_string2: string = "", in_separator: string = "/"): string {
    let separator = in_separator;

    if (!in_string1 ||
        !in_string2 ||
        in_string1.substr(-separator.length) === separator ||
        in_string2.substr(0, separator.length) === separator) {
        separator = "";
    }
    return in_string1 + separator + in_string2;
}
