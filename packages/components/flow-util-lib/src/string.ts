/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * True if left === right, or both left and right are "empty" where "empty" is
 * defined as { "", undefined, null }.
 */
export function areStringsEquivalent(left: string, right: string) {
    return !left                // If left any of { null, undefined, "" } ...
        ? !right                //   ...true if right any of  { null, undefined, "" }
        : left === right;       //   ...otherwise only true if left === right.
}
