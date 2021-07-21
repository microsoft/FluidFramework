/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageType } from "@fluidframework/protocol-definitions";

/**
 * Check if the string is a service message type, which includes
 * MessageType.ClientJoin, MessageType.ClientLeave, MessageType.Control,
 * MessageType.NoClient, MessageType.SummaryAck, and MessageType.SummaryNack
 *
 * @param type - the type to check
 * @returns true if it is a system message type
 */
export const isServiceMessageType = (type: string) => (
    type === MessageType.ClientJoin ||
    type === MessageType.ClientLeave ||
    type === MessageType.Control ||
    type === MessageType.NoClient ||
    type === MessageType.SummaryAck ||
    type === MessageType.SummaryNack);
