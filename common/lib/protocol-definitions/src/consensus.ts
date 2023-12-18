/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedClient } from "./clients";

/**
 * Proposal to set the given key/value pair.
 *
 * @remarks
 * Consensus on the proposal is achieved if the MSN is \>= the sequence number
 * at which the proposal is made and no client within the collaboration window rejects
 * the proposal.
 * @alpha
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
 * @alpha
 */
export type ISequencedProposal = { sequenceNumber: number } & IProposal;

/**
 * Adds the sequence number at which the message was approved to an {@link ISequencedProposal}.
 * @alpha
 */
export type IApprovedProposal = { approvalSequenceNumber: number } & ISequencedProposal;

/**
 * Adds the sequence number at which the message was committed to an {@link IApprovedProposal}.
 * @alpha
 */
export type ICommittedProposal = { commitSequenceNumber: number } & IApprovedProposal;

/**
 * @deprecated This type is now unused and will be removed
 * Events fired by a Quorum in response to client tracking.
 * @internal
 *
 */
export interface IQuorumClientsEvents {
	(event: "addMember", listener: (clientId: string, details: ISequencedClient) => void);
	(event: "removeMember", listener: (clientId: string) => void);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(event: "error", listener: (message: any) => void);
}

/**
 * Events fired by a Quorum in response to proposal tracking.
 * @internal
 * @deprecated This type is now unused and will be removed
 */
export interface IQuorumProposalsEvents {
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(event: "error", listener: (message: any) => void): void;
}

/**
 * All events fired by {@link IQuorum}, both client tracking and proposal tracking.
 * @internal
 * @deprecated This type is now unused and will be removed
 */
export type IQuorumEvents = IQuorumClientsEvents & IQuorumProposalsEvents;

/**
 * Interface for tracking clients in the Quorum.
 * @public
 */
export interface IQuorumClients {
	getMembers(): Map<string, ISequencedClient>;
	getMember(clientId: string): ISequencedClient | undefined;
	on(event: "addMember", listener: (clientId: string, details: ISequencedClient) => void);
	on(event: "removeMember", listener: (clientId: string) => void);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(event: "error", listener: (message: any) => void);
	once: IQuorumClients["on"];
	off: IQuorumClients["on"];
}

/**
 * Interface for tracking proposals in the Quorum.
 * @alpha
 */
export interface IQuorumProposals {
	propose(key: string, value: unknown): Promise<void>;

	has(key: string): boolean;

	get(key: string): unknown;

	on(event: "addProposal", listener: (proposal: ISequencedProposal) => void);
	on(
		event: "approveProposal",
		listener: (
			sequenceNumber: number,
			key: string,
			value: unknown,
			approvalSequenceNumber: number,
		) => void,
	);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	on(event: "error", listener: (message: any) => void): void;
	once: IQuorumProposals["on"];
	off: IQuorumProposals["on"];
}

/**
 * Interface combining tracking of clients as well as proposals in the Quorum.
 * @alpha
 */
export interface IQuorum
	extends Omit<IQuorumClients, "on" | "once" | "off">,
		Omit<IQuorumProposals, "on" | "once" | "off"> {
	on: IQuorumClients["on"] & IQuorumProposals["on"];
	once: IQuorum["on"];
	off: IQuorum["on"];
}

/**
 * @internal
 */
export interface IProtocolState {
	sequenceNumber: number;
	minimumSequenceNumber: number;
	members: [string, ISequencedClient][];
	proposals: [number, ISequencedProposal, string[]][];
	values: [string, ICommittedProposal][];
}

/**
 * @alpha
 */
export interface IProcessMessageResult {
	immediateNoOp?: boolean;
}
