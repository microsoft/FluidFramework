/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IDisposable, IErrorEvent, IEventProvider } from "@fluidframework/common-definitions";
import { IClient, ISequencedClient } from "./clients";

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
export type ISequencedProposal = { sequenceNumber: number; } & IProposal;

/**
 * Adds the sequence number at which the message was approved to an ISequencedProposal
 */
export type IApprovedProposal = { approvalSequenceNumber: number; } & ISequencedProposal;

/**
 * Adds the sequence number at which the message was committed to an IApprovedProposal
 */
export type ICommittedProposal = { commitSequenceNumber: number; } & IApprovedProposal;

/**
 * Events fired by a Quorum in response to client tracking.
 */
export interface IQuorumClientsEvents extends IErrorEvent {
    (event: "addMember", listener: (clientId: string, details: ISequencedClient) => void);
    (event: "removeMember", listener: (clientId: string) => void);
}

/**
 * Events fired by a Quorum in response to proposal tracking.
 */
export interface IQuorumProposalsEvents extends IErrorEvent {
    (event: "addProposal", listener: (proposal: ISequencedProposal) => void);
    (
        event: "approveProposal",
        listener: (sequenceNumber: number, key: string, value: any, approvalSequenceNumber: number) => void);
}

/**
 * All events fired by an IQuorum, both client tracking and proposal tracking.
 */
export type IQuorumEvents = IQuorumClientsEvents & IQuorumProposalsEvents;

/**
 * Interface for tracking clients in the Quorum.
 */
export interface IQuorumClients extends IEventProvider<IQuorumClientsEvents>, IDisposable {
    getMembers(): Map<string, ISequencedClient>;

    getMember(clientId: string): ISequencedClient | undefined;
}

/**
 * Interface for tracking proposals in the Quorum.
 */
export interface IQuorumProposals extends IEventProvider<IQuorumProposalsEvents>, IDisposable {
    propose(key: string, value: any): Promise<void>;

    has(key: string): boolean;

    get(key: string): any;
}

/**
 * Interface combining tracking of clients as well as proposals in the Quorum.
 */
export interface IQuorum extends
    Omit<IQuorumClients, "on" | "once" | "off">,
    Omit<IQuorumProposals, "on" | "once" | "off">,
    IEventProvider<IQuorumEvents> { }

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

/**
 * Audience represents all clients connected to the op stream, both read-only and read/write.
 *
 * See {@link https://nodejs.org/api/events.html#class-eventemitter | here} for an overview of the `EventEmitter`
 * class.
 */
 export interface IAudience extends EventEmitter {
    /**
     * See {@link https://nodejs.dev/learn/the-nodejs-event-emitter | here} for an overview of `EventEmitter.on`.
     */
    on(event: "addMember" | "removeMember", listener: (clientId: string, client: IClient) => void): this;

    /**
     * List all clients connected to the op stream, keyed off their clientId
     */
    getMembers(): Map<string, IClient>;

    /**
     * Get details about the connected client with the specified clientId,
     * or undefined if the specified client isn't connected
     */
    getMember(clientId: string): IClient | undefined;

    /**
     * Adds a new client to the audience
     */
    addMember(clientId: string, details: IClient);

    /**
    * Removes a client from the audience. Only emits an event if a client is actually removed
    * @returns if a client was removed from the audience
    */
    removeMember(clientId: string): boolean;

    /**
     * Clears the audience
     */
    clear();
}
