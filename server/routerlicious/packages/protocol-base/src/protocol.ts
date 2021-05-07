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

interface ICachedScribeProtocolState extends Partial<IScribeProtocolState> {
    sequenceNumber: number;
    minimumSequenceNumber: number;
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

    /**
     * Cached protocol state
     * Parts of it will be updated/cleared depending on the message being processed
     */
    private cachedProtocolState: ICachedScribeProtocolState;

    constructor(
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
        this.cachedProtocolState = {
            sequenceNumber,
            minimumSequenceNumber,
        };
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

                // quorum members is changing
                this.cachedProtocolState.members = undefined;

                break;

            case MessageType.ClientLeave:
                const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
                const clientId = JSON.parse(systemLeaveMessage.data) as string;
                this.quorum.removeMember(clientId);

                // quorum members is changing
                this.cachedProtocolState.members = undefined;

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

                // proposals are changing
                this.cachedProtocolState.proposals = undefined;

                break;

            case MessageType.Reject:
                const sequenceNumber = message.contents as number;
                this.quorum.rejectProposal(message.clientId, sequenceNumber);

                // proposals are changing
                this.cachedProtocolState.proposals = undefined;

                break;

            default:
        }

        // Update tracked sequence numbers
        this.minimumSequenceNumber = message.minimumSequenceNumber;
        this.sequenceNumber = message.sequenceNumber;

        this.cachedProtocolState.minimumSequenceNumber = this.minimumSequenceNumber;
        this.cachedProtocolState.sequenceNumber = this.sequenceNumber;

        // Notify the quorum of the MSN from the message. We rely on it to handle duplicate values but may
        // want to move that logic to this class.
        const updateMsnResult = this.quorum.updateMinimumSequenceNumber(message);
        if (updateMsnResult) {
            if (updateMsnResult.immediateNoOp) {
                immediateNoOp = true;
            }

            if (updateMsnResult.proposals) {
                // clear the proposals cache
                this.cachedProtocolState.proposals = undefined;
            }

            if (updateMsnResult.values) {
                // clear the values cache
                this.cachedProtocolState.values = undefined;
            }
        }

        return { immediateNoOp };
    }

    /**
     * Gets the scribe protocol state
     */
    public getProtocolState(): IScribeProtocolState {
        const protocolState = this.cachedProtocolState;

        protocolState.members ??= this.quorum.snapshotMembers();
        protocolState.proposals ??= this.quorum.snapshotProposals();
        protocolState.values ??= this.quorum.snapshotValues();

        // return a new object every time
        // this ensures future state changes will not affect outside callers
        return {
            sequenceNumber: this.sequenceNumber,
            minimumSequenceNumber: this.minimumSequenceNumber,
            members: protocolState.members,
            proposals: protocolState.proposals,
            values: protocolState.values,
        };
    }
}
