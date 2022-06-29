/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAudience } from "@fluidframework/container-definitions";
import {
    ILocalSequencedClient,
    IProtocolHandler as IBaseProtocolHandler,
    IQuorumSnapshot,
    ProtocolOpHandler,
} from "@fluidframework/protocol-base";
import {
    IDocumentAttributes,
    IProcessMessageResult,
    ISequencedDocumentMessage,
    ISignalClient,
    ISignalMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";


export interface IProtocolDetails {
    /**
     * Optional function to be used for creating a protocol handler. If not provided,
     * an instance of {@link @fluidframework/protocol-base/protocol.ts#ProtocolOpHandlerWithClientValidation}
     * will be created and used.
     */
    protocolHandlerBuilder?: ProtocolHandlerBuilder;

    /**
     * Optional implementation of the audience logic. If not provided,
     * the default fluid implementation will be used.
     */
    audience?: IAudience;
}

export type ProtocolHandlerBuilder = (
    attributes: IDocumentAttributes,
    snapshot: IQuorumSnapshot,
    sendProposal: (key: string, value: any) => number,
    audience: IAudience,
) => IProtocolHandler;

export interface IProtocolHandler extends IBaseProtocolHandler {
    readonly audience: IAudience;
}

export class ProtocolOpHandlerWithClientValidation extends ProtocolOpHandler implements IProtocolHandler {
    constructor(
        attributes: IDocumentAttributes,
        quorumSnapshot: IQuorumSnapshot,
        sendProposal: (key: string, value: any) => number,
        readonly audience: IAudience,
    ) {
        super(
            attributes.minimumSequenceNumber,
            attributes.sequenceNumber,
            attributes.term,
            quorumSnapshot.members,
            quorumSnapshot.proposals,
            quorumSnapshot.values,
            sendProposal,
        );
    }

    public processMessage(message: ISequencedDocumentMessage, local: boolean): IProcessMessageResult {
        const client: ILocalSequencedClient | undefined = this.quorum.getMember(message.clientId);

        // Check and report if we're getting messages from a clientId that we previously
        // flagged as shouldHaveLeft, or from a client that's not in the quorum but should be
        if (message.clientId != null) {
            if (client === undefined && message.type !== MessageType.ClientJoin) {
                // pre-0.58 error message: messageClientIdMissingFromQuorum
                throw new Error("Remote message's clientId is missing from the quorum");
            }

            if (client?.shouldHaveLeft === true && message.type !== MessageType.NoOp) {
                // pre-0.58 error message: messageClientIdShouldHaveLeft
                throw new Error("Remote message's clientId already should have left");
            }
        }

        return super.processMessage(message, local);
    }

    public processSignal(message: ISignalMessage) {
        const innerContent = message.content as { content: any; type: string; };
        if (innerContent.type === MessageType.ClientJoin) {
            const newClient = innerContent.content as ISignalClient;
            this.audience.addMember(newClient.clientId, newClient.client);
        } else if (innerContent.type === MessageType.ClientLeave) {
            const leftClientId = innerContent.content as string;
            this.audience.removeMember(leftClientId);
        }
    }
}
