/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { IProtocolState } from "@fluidframework/protocol-definitions";

export const initializeProtocol = (
    protocolState: IProtocolState,
    term: number,
): ProtocolOpHandler => new ProtocolOpHandler(
    protocolState.minimumSequenceNumber,
    protocolState.sequenceNumber,
    term,
    protocolState.members,
    protocolState.proposals,
    protocolState.values,
    () => -1,
    () => { return; },
);
