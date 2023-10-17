/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorEvent, IEventProvider } from "@fluidframework/common-definitions";
import { ISequencedClient } from "./clients";

/**
 * Proposal to set the given key/value pair.
 *
 * @remarks
 * Consensus on the proposal is achieved if the MSN is \>= the sequence number
 * at which the proposal is made and no client within the collaboration window rejects
 * the proposal.
 *
 * @public
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
 * Similar to {@link IProposal} except it also includes the sequence number when it was made.
 *
 * @public
 */
export type ISequencedProposal = { sequenceNumber: number } & IProposal;

/**
 * Adds the sequence number at which the message was approved to an {@link ISequencedProposal}.
 *
 * @public
 */
export type IApprovedProposal = { approvalSequenceNumber: number } & ISequencedProposal;

/**
 * Adds the sequence number at which the message was committed to an {@link IApprovedProposal}.
 *
 * @public
 */
export type ICommittedProposal = { commitSequenceNumber: number } & IApprovedProposal;

/**
 * Events fired by a Quorum in response to client tracking.
 *
 * @public
 */
export interface IQuorumClientsEvents extends IErrorEvent {
	(event: "addMember", listener: (clientId: string, details: ISequencedClient) => void);
	(event: "removeMember", listener: (clientId: string) => void);
}

/**
 * Events fired by a Quorum in response to proposal tracking.
 *
 * @public
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
 * All events fired by {@link IQuorum}, both client tracking and proposal tracking.
 *
 * @public
 */
export type IQuorumEvents = IQuorumClientsEvents & IQuorumProposalsEvents;

/**
 * Interface for tracking clients in the Quorum.
 *
 * @public
 */
export interface IQuorumClients extends IEventProvider<IQuorumClientsEvents> {
	getMembers(): Map<string, ISequencedClient>;

	getMember(clientId: string): ISequencedClient | undefined;
}

/**
 * Interface for tracking proposals in the Quorum.
 *
 * @public
 */
export interface IQuorumProposals extends IEventProvider<IQuorumProposalsEvents> {
	propose(key: string, value: unknown): Promise<void>;

	has(key: string): boolean;

	get(key: string): unknown;
}

/**
 * Interface combining tracking of clients as well as proposals in the Quorum.
 *
 * @public
 */
export interface IQuorum
	extends Omit<IQuorumClients, "on" | "once" | "off">,
		Omit<IQuorumProposals, "on" | "once" | "off">,
		IEventProvider<IQuorumEvents> {}

/**
 * @public
 */
export interface IProtocolState {
	sequenceNumber: number;
	minimumSequenceNumber: number;
	members: [string, ISequencedClient][];
	proposals: [number, ISequencedProposal, string[]][];
	values: [string, ICommittedProposal][];
}

/**
 * @public
 */
export interface IProcessMessageResult {
	immediateNoOp?: boolean;
}
