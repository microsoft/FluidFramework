/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as io from "socket.io-client";

/**
 * This function only exists to create an ESM wrapper around the socket.io client module
 * for compatibility with ESM dynamic imports
 */
export function getSocketIo(): SocketIOClientStatic {
    return io;
}
