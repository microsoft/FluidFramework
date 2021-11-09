/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Checks whether the given key from a ChangeSet is not a typeid, but one of the
 * reserved keywords.
 *
 * @ignore
 * @param in_key - The key to check
 * @returns True if it is a reserved keyword
 */
export const isReservedKeyword = (in_key: string): boolean => in_key === "insert" ||
        in_key === "remove" ||
        in_key === "modify" ||
        in_key === "typeid" ||
        in_key === "insertTemplates";
