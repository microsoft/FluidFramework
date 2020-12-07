/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
        branchId: string,
        public minimumSequenceNumber: number,
        public sequenceNumber: number,
        term: number | undefined,
        members: [string, ISequencedClient][],
        proposals: [number, ISequencedProposal, string[]][],
        values: [string, ICommittedProposal][],
        sendProposal: (key: string, value: any) => number,
        sendReject: (sequenceNumber: number) => void) {
        this.term = term ?? 1;
        this.quorum = new Quorum(
            minimumSequenceNumber,
            members,
            proposals,
            values,
            sendProposal,
            sendReject);
    }

    public close() {
        this.quorum.close();
    }

    public processMessage(message: ISequencedDocumentMessage, local: boolean): IProcessMessageResult {
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
                const sequenceNumber = message.contents as number;
                this.quorum.rejectProposal(message.clientId, sequenceNumber);
                break;

            default:
        }

        // Update tracked sequence numbers
        this.minimumSequenceNumber = message.minimumSequenceNumber;
        this.sequenceNumber = message.sequenceNumber;

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        immediateNoOp = this.quorum.updateMinimumSequenceNumber(message) || immediateNoOp;

        return { immediateNoOp };
    }

    public getProtocolState(): IScribeProtocolState {
        const quorumSnapshot = this.quorum.snapshot();

        return {
            members: quorumSnapshot.members,
            minimumSequenceNumber: this.minimumSequenceNumber,
            proposals: quorumSnapshot.proposals,
            sequenceNumber: this.sequenceNumber,
            values: quorumSnapshot.values,
        };
    }
}
