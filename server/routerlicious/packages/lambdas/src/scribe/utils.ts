/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import { IDocumentMessage, IDocumentSystemMessage, IProtocolState } from "@fluidframework/protocol-definitions";
import { IProducer, IRawOperationMessage, RawOperationType } from "@fluidframework/server-services-core";

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

// eslint-disable-next-line @typescript-eslint/promise-function-async
export const sendToDeli = (
    tenantId: string,
    documentId: string,
    producer: IProducer | undefined,
    operation: IDocumentMessage | IDocumentSystemMessage,
    ): Promise<any> => {
        if (!producer) {
            throw new Error("Invalid producer");
        }

        const message: IRawOperationMessage = {
            clientId: null,
            documentId,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };

        return producer.send(
            [message],
            tenantId,
            documentId);
};
