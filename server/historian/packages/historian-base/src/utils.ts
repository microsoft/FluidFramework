/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
    // named pipe
        return val;
    }

    if (normalizedPort >= 0) {
    // port number
        return normalizedPort;
    }

    return false;
}
