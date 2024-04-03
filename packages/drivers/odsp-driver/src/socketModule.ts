/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { io } from "socket.io-client";

// Import is required for side-effects.
// eslint-disable-next-line unicorn/prefer-export-from
export const SocketIOClientStatic = io;
