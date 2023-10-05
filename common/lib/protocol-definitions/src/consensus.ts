/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorEvent, IEventProvider } from "@fluidframework/common-definitions";
import { ISequencedClient } from "./clients";

/**
 * Proposal to set the given key/value pair.
 *
 * Consensus on the proposal is achieved if the MSN is \>= the sequence number
 * at which the proposal is made and no client within the collaboration window rejects
 * the proposal.
 */
export interface IProposal {
	/**
	 * The key for the proposal.
	 */
	key: string;

	/**
	 * The value of the proposal.
	 */
	value: unknown;
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
		listener: (
			sequenceNumber: number,
			key: string,
			value: unknown,
			approvalSequenceNumber: number,
		) => void,
	);
}

/**
 * All events fired by an IQuorum, both client tracking and proposal tracking.
 */
export type IQuorumEvents = IQuorumClientsEvents & IQuorumProposalsEvents;

/**
 * Interface for tracking clients in the Quorum.
 */
export interface IQuorumClients extends IEventProvider<IQuorumClientsEvents> {
	getMembers(): Map<string, ISequencedClient>;

	getMember(clientId: string): ISequencedClient | undefined;
}

/**
 * Interface for tracking proposals in the Quorum.
 */
export interface IQuorumProposals extends IEventProvider<IQuorumProposalsEvents> {
	propose(key: string, value: unknown): Promise<void>;

	has(key: string): boolean;

	get(key: string): unknown;
}

/**
 * Interface combining tracking of clients as well as proposals in the Quorum.
 */
export interface IQuorum
	extends Omit<IQuorumClients, "on" | "once" | "off">,
		Omit<IQuorumProposals, "on" | "once" | "off">,
		IEventProvider<IQuorumEvents> {}

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
