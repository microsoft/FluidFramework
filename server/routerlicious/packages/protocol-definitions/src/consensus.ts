/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, IErrorEvent, IEventProvider } from "@fluidframework/common-definitions";
import { ISequencedClient } from "./clients";

/**
 * Proposal to set the given key/value pair.
 *
 * Consensus on the proposal is achieved if the MSN is \>= the sequence number
 * at which the proposal is made and no client within the collaboration window rejects
 * the proposal.
 */
export interface IProposal {
    // The key for the proposal
    key: string;

    // The value of the proposal
    value: any;
}

/**
 * Similar to IProposal except includes the sequence number when it was made in addition to the fields on IProposal
 */
export type ISequencedProposal = { sequenceNumber: number } & IProposal;

/**
 * Adds the sequence number at which the message was approved to an ISequencedProposal
 */
export type IApprovedProposal = { approvalSequenceNumber: number } & ISequencedProposal;

/**
 * Adds the sequence number at which the message was committed to an IApprovedProposal
 */
export type ICommittedProposal = { commitSequenceNumber: number } & IApprovedProposal;

/**
 * A proposal that has been propposed, but not yet accepted or committed
 */
export interface IPendingProposal extends ISequencedProposal {
    /**
     * Sends a rejection for the proposal
     */
    reject();

    /**
     * Disables the sending of rejections for this proposal
     */
    disableRejection();

    /**
     * Returns true if rejections has been disable, otherwise false
     */
    readonly rejectionDisabled: boolean;
}

export interface IQuorumEvents extends IErrorEvent {
    (event: "addMember", listener: (clientId: string, details: ISequencedClient) => void);
    (event: "removeMember", listener: (clientId: string) => void);
    (event: "addProposal", listener: (proposal: IPendingProposal) => void);
    (
        event: "approveProposal",
        listener: (sequenceNumber: number, key: string, value: any, approvalSequenceNumber: number) => void);
    (
        event: "commitProposal",
        listener: (
            sequenceNumber: number,
            key: string,
            value: any,
            approvalSequenceNumber: number,
            commitSequenceNumber: number) => void);
    (
        event: "rejectProposal",
        listener: (sequenceNumber: number, key: string, value: any, rejections: string[]) => void);
}

/**
 * Class representing agreed upon values in a quorum
 */
export interface IQuorum extends IEventProvider<IQuorumEvents>, IDisposable {
    propose(key: string, value: any): Promise<void>;

    has(key: string): boolean;

    get(key: string): any;

    getApprovalData(key: string): ICommittedProposal | undefined;

    getMembers(): Map<string, ISequencedClient>;

    getMember(clientId: string): ISequencedClient | undefined;
}

export interface IProtocolState {
    sequenceNumber: number;
    minimumSequenceNumber: number;
    members: [string, ISequencedClient][];
    proposals: [number, ISequencedProposal, string[]][];
    values: [string, ICommittedProposal][];
}

export interface IProcessMessageResult {
    immediateNoOp?: boolean;
}
