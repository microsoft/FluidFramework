/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Normalize a port into a number, string, or false.
 */
export function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // Named pipe
        return val;
    }

    if (normalizedPort >= 0) {
        // Port number
        return normalizedPort;
    }

    return false;
}
