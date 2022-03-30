/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import io from "socket.io-client";

/**
 * This function only exists to create an ESM wrapper around the socket.io client module
 * for compatibility with ESM dynamic imports
 */
export function getSocketIo(): typeof io {
    return io;
}
