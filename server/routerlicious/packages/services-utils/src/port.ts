/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Normalize a port into a number, string, or false.
 */
export function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // Named pipe
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return val;
    }

    if (normalizedPort >= 0) {
        // Port number
        return normalizedPort;
    }

    return false;
}
