/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageType } from "@fluidframework/protocol-definitions";

/**
 * Check if the string is a system message type, which includes
 * MessageType.RemoteHelp, MessageType.ClientJoin, MessageType.ClientLeave
 *
 * @param type - the type to check
 * @returns true if it is a system message type
 */
export const isSystemType = (type: string) => (
    type === MessageType.RemoteHelp ||
    type === MessageType.ClientJoin ||
    type === MessageType.ClientLeave ||
    type === MessageType.Control);
