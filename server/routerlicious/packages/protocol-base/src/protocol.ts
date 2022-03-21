/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IClientJoin,
    ICommittedProposal,
    IProcessMessageResult,
    IProposal,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ISequencedProposal,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { Quorum } from "./quorum";

export interface IScribeProtocolState {
    sequenceNumber: number;
    minimumSequenceNumber: number;
    members: [string, ISequencedClient][];
    proposals: [number, ISequencedProposal, string[]][];
    values: [string, ICommittedProposal][];
}

export function isSystemMessage(message: ISequencedDocumentMessage) {
    switch (message.type) {
        case MessageType.ClientJoin:
        case MessageType.ClientLeave:
        case MessageType.Propose:
        case MessageType.Reject:
        case MessageType.NoOp:
        case MessageType.NoClient:
        case MessageType.Summarize:
        case MessageType.SummaryAck:
        case MessageType.SummaryNack:
            return true;
        default:
            return false;
    }
}

/**
 * Handles protocol specific ops.
 */
export class ProtocolOpHandler {
    public readonly quorum: Quorum;
    public readonly term: number;

    constructor(
        public minimumSequenceNumber: number,
        public sequenceNumber: number,
        term: number | undefined,
        members: [string, ISequencedClient][],
        proposals: [number, ISequencedProposal, string[]][],
        values: [string, ICommittedProposal][],
        sendProposal: (key: string, value: any) => number,
    ) {
        this.term = term ?? 1;
        this.quorum = new Quorum(
            members,
            proposals,
            values,
            sendProposal,
        );
    }

    public close() {
        this.quorum.close();
    }

    public processMessage(message: ISequencedDocumentMessage, local: boolean): IProcessMessageResult {
        // verify it's moving sequentially
        if (message.sequenceNumber !== this.sequenceNumber + 1) {
            throw new Error(
                `Protocol state is not moving sequentially. ` +
                `Current is ${this.sequenceNumber}. Next is ${message.sequenceNumber}`);
        }

        // Update tracked sequence numbers
        this.sequenceNumber = message.sequenceNumber;
        this.minimumSequenceNumber = message.minimumSequenceNumber;

        let immediateNoOp = false;

        switch (message.type) {
            case MessageType.ClientJoin:
                const systemJoinMessage = message as ISequencedDocumentSystemMessage;
                const join = JSON.parse(systemJoinMessage.data) as IClientJoin;
                const member: ISequencedClient = {
                    client: join.detail,
                    sequenceNumber: systemJoinMessage.sequenceNumber,
                };
                this.quorum.addMember(join.clientId, member);
                break;

            case MessageType.ClientLeave:
                const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
                const clientId = JSON.parse(systemLeaveMessage.data) as string;
                this.quorum.removeMember(clientId);
                break;

            case MessageType.Propose:
                const proposal = message.contents as IProposal;
                this.quorum.addProposal(
                    proposal.key,
                    proposal.value,
                    message.sequenceNumber,
                    local,
                    message.clientSequenceNumber);

                // On a quorum proposal, immediately send a response to expedite the approval.
                immediateNoOp = true;
                break;

            case MessageType.Reject:
                throw new Error("Quorum rejection is removed.");

            default:
        }

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        this.quorum.updateMinimumSequenceNumber(message);

        return { immediateNoOp };
    }

    /**
     * Gets the scribe protocol state
     */
    public getProtocolState(): IScribeProtocolState {
        // return a new object every time
        // this ensures future state changes will not affect outside callers
        return {
            sequenceNumber: this.sequenceNumber,
            minimumSequenceNumber: this.minimumSequenceNumber,
            ...this.quorum.snapshot(),
        };
    }
}
