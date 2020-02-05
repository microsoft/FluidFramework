/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable } from "@microsoft/fluid-common-definitions";
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

export interface IPendingProposal extends ISequencedProposal {
    reject();
}

/**
 * Class representing agreed upon values in a quorum
 */
export interface IQuorum extends EventEmitter, IDisposable {
    propose(key: string, value: any): Promise<void>;

    has(key: string): boolean;

    get(key: string): any;

    getApprovalData(key: string): ICommittedProposal | undefined;

    getMembers(): Map<string, ISequencedClient>;

    getMember(clientId: string): ISequencedClient | undefined;

    on(event: "error", listener: (message: any) => void): this;
    on(event: "addMember", listener: (clientId: string, details: ISequencedClient) => void): this;
    on(event: "removeMember", listener: (clientId: string) => void): this;
    on(event: "addProposal", listener: (proposal: IPendingProposal) => void): this;
    on(
        event: "approveProposal",
        listener: (sequenceNumber: number, key: string, value: any, approvalSequenceNumber: number) => void): this;
    on(
        event: "commitProposal",
        listener: (
            sequenceNumber: number,
            key: string,
            value: any,
            approvalSequenceNumber: number,
            commitSequenceNumber: number) => void): this;
    on(
        event: "rejectProposal",
        listener: (sequenceNumber: number, key: string, value: any, rejections: string[]) => void): this;
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
