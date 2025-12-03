/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { io } from "socket.io-client";

import { type Mockable, mockify } from "./mockify.js";

export const SocketIOClientStatic: Mockable<typeof io> = mockify(io);
