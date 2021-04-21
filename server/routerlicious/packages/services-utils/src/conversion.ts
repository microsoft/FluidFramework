/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Parses the given value into a boolean
 */
export const parseBoolean = (value: any): boolean =>
    typeof value === "boolean" ? value : value === "true";
