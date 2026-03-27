/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { io } from "socket.io-client";

// eslint-disable-next-line unicorn/prefer-export-from -- Import is required for side-effects.
export const SocketIOClientStatic = io;
