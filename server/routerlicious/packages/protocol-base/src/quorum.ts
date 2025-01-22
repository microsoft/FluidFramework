/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import events_pkg from "events_pkg";
const { EventEmitter } = events_pkg;

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	ICommittedProposal,
	IQuorum,
	IQuorumClients,
	IQuorumProposals,
	ISequencedClient,
	ISequencedDocumentMessage,
	ISequencedProposal,
} from "@fluidframework/protocol-definitions";

/**
 * Throws if condition is false.
 * @privateRemarks
 * TODO: Migrate this to a common assert pattern or library for server code.
 */
function assert(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

/**
 * Structure for tracking proposals that have been sequenced but not approved yet.
 */
class PendingProposal implements ISequencedProposal {
	constructor(
		public readonly sequenceNumber: number,
		public readonly key: string,
		public readonly value: any,
		public readonly local: boolean,
	) {}
}

/**
 * Snapshot format for a QuorumClients
 * @alpha
 */
export type QuorumClientsSnapshot = [string, ISequencedClient][];

/**
 * Snapshot format for a QuorumProposals
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type QuorumProposalsSnapshot = {
	proposals: [number, ISequencedProposal, string[]][];
	values: [string, ICommittedProposal][];
};

/**
 * Snapshot format for a Quorum
 * @alpha
 */
export interface IQuorumSnapshot {
	members: QuorumClientsSnapshot;
	proposals: QuorumProposalsSnapshot["proposals"];
	values: QuorumProposalsSnapshot["values"];
}

/**
 * The QuorumClients is used to track members joining and leaving the collaboration session.
 * @internal
 */
export class QuorumClients
	extends TypedEventEmitter<IQuorumClients["on"]>
	implements IQuorumClients
{
	private readonly members: Map<string, ISequencedClient>;
	private isDisposed: boolean = false;
	public get disposed() {
		return this.isDisposed;
	}

	/**
	 * Cached snapshot state, to avoid unnecessary deep clones on repeated snapshot calls.
	 * Cleared immediately (set to undefined) when the cache becomes invalid.
	 */
	private snapshotCache: QuorumClientsSnapshot | undefined;

	constructor(snapshot: QuorumClientsSnapshot) {
		super();

		this.members = new Map(snapshot);
		this.snapshotCache = snapshot;
	}

	/**
	 * Snapshots the current state of the QuorumClients
	 * @returns a snapshot of the clients in the quorum
	 */
	public snapshot(): QuorumClientsSnapshot {
		this.snapshotCache ??= Array.from(this.members);

		return this.snapshotCache;
	}

	/**
	 * Adds a new client to the quorum
	 */
	public addMember(clientId: string, details: ISequencedClient) {
		assert(!!clientId, "clientId has to be non-empty string");
		assert(!this.members.has(clientId), "clientId not found");
		this.members.set(clientId, details);
		this.emit("addMember", clientId, details);

		// clear the cache
		this.snapshotCache = undefined;
	}

	/**
	 * Removes a client from the quorum
	 */
	public removeMember(clientId: string) {
		assert(!!clientId, "clientId has to be non-empty string");
		assert(this.members.has(clientId), "clientId not found");
		this.members.delete(clientId);
		this.emit("removeMember", clientId);

		// clear the cache
		this.snapshotCache = undefined;
	}

	/**
	 * Retrieves all the members in the quorum
	 */
	public getMembers(): Map<string, ISequencedClient> {
		return new Map(this.members);
	}

	/**
	 * Retrieves a specific member of the quorum
	 */
	public getMember(clientId: string): ISequencedClient | undefined {
		return this.members.get(clientId);
	}

	public dispose(): void {
		this.isDisposed = true;
	}
}

/**
 * The QuorumProposals holds a key/value store.  Proposed values become finalized in the store once all connected
 * clients have seen the proposal.
 * @internal
 */
export class QuorumProposals
	extends TypedEventEmitter<IQuorumProposals["on"]>
	implements IQuorumProposals
{
	private readonly proposals: Map<number, PendingProposal>;
	private readonly values: Map<string, ICommittedProposal>;
	private isDisposed: boolean = false;
	public get disposed() {
		return this.isDisposed;
	}

	// Event emitter for changes to the environment that affect pending proposal promises.
	private readonly stateEvents = new EventEmitter();

	/**
	 * Cached snapshot state, to avoid unnecessary deep clones on repeated snapshot calls.
	 * Cleared immediately (set to undefined) when the cache becomes invalid.
	 */
	private proposalsSnapshotCache: QuorumProposalsSnapshot["proposals"] | undefined;
	private valuesSnapshotCache: QuorumProposalsSnapshot["values"] | undefined;

	constructor(
		snapshot: QuorumProposalsSnapshot,
		private readonly sendProposal: (key: string, value: any) => number,
	) {
		super();

		this.proposals = new Map(
			snapshot.proposals.map(([, proposal]) => {
				return [
					proposal.sequenceNumber,
					new PendingProposal(
						proposal.sequenceNumber,
						proposal.key,
						proposal.value,
						false, // local
					),
				] as [number, PendingProposal];
			}),
		);
		this.values = new Map(snapshot.values);
		this.proposalsSnapshotCache = snapshot.proposals;
		this.valuesSnapshotCache = snapshot.values;
	}

	/**
	 * Snapshots the current state of the QuorumProposals
	 * @returns arrays of proposals and values
	 */
	public snapshot(): QuorumProposalsSnapshot {
		this.proposalsSnapshotCache ??= Array.from(this.proposals).map(
			([sequenceNumber, proposal]) => [
				sequenceNumber,
				{ sequenceNumber, key: proposal.key, value: proposal.value },
				[], // rejections, which has been removed
			],
		);
		this.valuesSnapshotCache ??= Array.from(this.values);

		return {
			proposals: this.proposalsSnapshotCache,
			values: this.valuesSnapshotCache,
		};
	}

	/**
	 * Returns whether the quorum has achieved a consensus for the given key.
	 */
	public has(key: string): boolean {
		return this.values.has(key);
	}

	/**
	 * Returns the consensus value for the given key
	 */
	public get(key: string): any {
		return this.values.get(key)?.value;
	}

	/**
	 * Returns additional data about the approved consensus value
	 * @deprecated Removed in recent protocol-definitions.  Use get() instead.
	 */
	public getApprovalData(key: string): ICommittedProposal | undefined {
		return this.values.get(key);
	}

	/**
	 * Proposes a new value. Returns a promise that will either:
	 * - Resolve when the proposal is accepted
	 * - Reject if the proposal fails to send or if the QuorumProposals is disposed
	 */
	public async propose(key: string, value: any): Promise<void> {
		const clientSequenceNumber = this.sendProposal(key, value);
		if (clientSequenceNumber < 0) {
			this.emit("error", { eventName: "ProposalInDisconnectedState", key });
			throw new Error("Can't propose in disconnected state");
		}

		return new Promise<void>((resolve, reject) => {
			// The sequence number that our proposal was assigned and went pending.
			// If undefined, then it's not sequenced yet.
			let thisProposalSequenceNumber: number | undefined;

			// A proposal goes through two phases before this promise resolves:
			// 1. Sequencing - waiting for the proposal to be ack'd by the server.
			// 2. Approval - waiting for the proposal to be approved by connected clients.
			const localProposalSequencedHandler = (
				sequencedCSN: number,
				sequenceNumber: number,
			) => {
				if (sequencedCSN === clientSequenceNumber) {
					thisProposalSequenceNumber = sequenceNumber;
					this.stateEvents.off("localProposalSequenced", localProposalSequencedHandler);
					this.stateEvents.off("disconnected", disconnectedHandler);
					this.stateEvents.on("localProposalApproved", localProposalApprovedHandler);
				}
			};
			const localProposalApprovedHandler = (sequenceNumber: number) => {
				// Proposals can be uniquely identified by the sequenceNumber they were assigned.
				if (sequenceNumber === thisProposalSequenceNumber) {
					resolve();
					removeListeners();
				}
			};

			// There are two error flows we consider:  disconnect and disposal.
			// If we get disconnected before the proposal is sequenced, it has one of two possible futures:
			// 1. We reconnect and see the proposal was sequenced in the meantime.
			//    -> The promise can still resolve, once it is approved.
			// 2. We reconnect and see the proposal was not sequenced in the meantime, so it will never sequence.
			//    -> The promise rejects.
			const disconnectedHandler = () => {
				// If we haven't seen the ack by the time we disconnect, we hope to see it by the time we reconnect.
				if (thisProposalSequenceNumber === undefined) {
					this.stateEvents.once("connected", () => {
						// If we don't see the ack by the time reconnection finishes, it failed to send.
						if (thisProposalSequenceNumber === undefined) {
							reject(
								new Error(
									"Client disconnected without successfully sending proposal",
								),
							);
							removeListeners();
						}
					});
				}
			};
			// If the QuorumProposals is disposed of, we assume something catastrophic has happened
			// All outstanding proposals are considered rejected.
			const disposedHandler = () => {
				reject(new Error("QuorumProposals was disposed"));
				removeListeners();
			};
			// Convenience function to clean up our listeners.
			const removeListeners = () => {
				this.stateEvents.off("localProposalSequenced", localProposalSequencedHandler);
				this.stateEvents.off("localProposalApproved", localProposalApprovedHandler);
				this.stateEvents.off("disconnected", disconnectedHandler);
				this.stateEvents.off("disposed", disposedHandler);
			};
			this.stateEvents.on("localProposalSequenced", localProposalSequencedHandler);
			this.stateEvents.on("disconnected", disconnectedHandler);
			this.stateEvents.on("disposed", disposedHandler);
		});
	}

	/**
	 * Begins tracking a new proposal
	 */
	public addProposal(
		key: string,
		value: any,
		sequenceNumber: number,
		local: boolean,
		clientSequenceNumber: number,
	) {
		assert(!this.proposals.has(sequenceNumber), "sequenceNumber not found");

		const proposal = new PendingProposal(sequenceNumber, key, value, local);
		this.proposals.set(sequenceNumber, proposal);

		// Legacy event, from rejection support.  May still have some use for clients to learn that a proposal is
		// likely to be approved soon.
		this.emit("addProposal", proposal);

		if (local) {
			this.stateEvents.emit("localProposalSequenced", clientSequenceNumber, sequenceNumber);
		}

		// clear the proposal cache
		this.proposalsSnapshotCache = undefined;
	}

	/**
	 * Updates the minimum sequence number. If the MSN advances past the sequence number for any proposal then it
	 * becomes an approved value.
	 */
	public updateMinimumSequenceNumber(message: ISequencedDocumentMessage): void {
		const msn = message.minimumSequenceNumber;

		// Accept proposals proposals whose sequenceNumber is <= the minimumSequenceNumber

		// Return a sorted list of approved proposals. We sort so that we apply them in their sequence number order
		// TODO this can be optimized if necessary to avoid the linear search+sort
		const completed: PendingProposal[] = [];
		for (const [sequenceNumber, proposal] of this.proposals) {
			if (sequenceNumber <= msn) {
				completed.push(proposal);
			}
		}
		completed.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

		for (const proposal of completed) {
			const committedProposal: ICommittedProposal = {
				approvalSequenceNumber: message.sequenceNumber,
				// No longer used.  We still stamp a -1 for compat with older versions of the quorum.
				// Can be removed after 0.1035 and higher is ubiquitous.
				commitSequenceNumber: -1,
				key: proposal.key,
				sequenceNumber: proposal.sequenceNumber,
				value: proposal.value,
			};

			this.values.set(committedProposal.key, committedProposal);

			// clear the values cache
			this.valuesSnapshotCache = undefined;

			// check if there are multiple proposals with matching keys
			let proposalSettled = false;
			let proposalKeySeen = false;
			for (const [, p] of this.proposals) {
				if (p.key === committedProposal.key) {
					if (!proposalKeySeen) {
						// set proposalSettled to true if the proposal key match is unique thus far
						proposalSettled = true;
					} else {
						// set proposalSettled to false if matching proposal key is not unique
						proposalSettled = false;
						break;
					}
					proposalKeySeen = true;
				}
			}

			this.emit(
				"approveProposal",
				committedProposal.sequenceNumber,
				committedProposal.key,
				committedProposal.value,
				committedProposal.approvalSequenceNumber,
			);

			// emit approveProposalComplete when all pending proposals are processed
			if (proposalSettled) {
				this.emit(
					"approveProposalComplete",
					committedProposal.sequenceNumber,
					committedProposal.key,
					committedProposal.value,
					committedProposal.approvalSequenceNumber,
				);
			}

			this.proposals.delete(proposal.sequenceNumber);

			// clear the proposals cache
			this.proposalsSnapshotCache = undefined;
			if (proposal.local) {
				this.stateEvents.emit("localProposalApproved", proposal.sequenceNumber);
			}
		}
	}

	public setConnectionState(connected: boolean) {
		if (connected) {
			this.stateEvents.emit("connected");
		} else {
			this.stateEvents.emit("disconnected");
		}
	}

	public dispose(): void {
		this.isDisposed = true;
		this.stateEvents.emit("disposed");
	}
}

/**
 * A quorum represents all clients currently within the collaboration window. As well as the values
 * they have agreed upon and any pending proposals.
 * @internal
 */
export class Quorum extends TypedEventEmitter<IQuorum["on"]> implements IQuorum {
	private readonly quorumClients: QuorumClients;
	private readonly quorumProposals: QuorumProposals;
	private isDisposed: boolean = false;
	public get disposed() {
		return this.isDisposed;
	}

	constructor(
		members: QuorumClientsSnapshot,
		proposals: QuorumProposalsSnapshot["proposals"],
		values: QuorumProposalsSnapshot["values"],
		sendProposal: (key: string, value: any) => number,
	) {
		super();

		this.quorumClients = new QuorumClients(members);
		this.quorumClients.on("addMember", (clientId: string, details: ISequencedClient) => {
			this.emit("addMember", clientId, details);
		});
		this.quorumClients.on("removeMember", (clientId: string) => {
			this.emit("removeMember", clientId);
		});

		this.quorumProposals = new QuorumProposals({ proposals, values }, sendProposal);
		this.quorumProposals.on("addProposal", (proposal: ISequencedProposal) => {
			this.emit("addProposal", proposal);
		});
		this.quorumProposals.on(
			"approveProposal",
			(sequenceNumber: number, key: string, value: any, approvalSequenceNumber: number) => {
				this.emit("approveProposal", sequenceNumber, key, value, approvalSequenceNumber);
			},
		);
	}

	public close() {
		this.removeAllListeners();
	}

	/**
	 * Snapshots the entire quorum
	 * @returns a quorum snapshot
	 */
	public snapshot(): IQuorumSnapshot {
		const members = this.quorumClients.snapshot();
		const { proposals, values } = this.quorumProposals.snapshot();
		return {
			members,
			proposals,
			values,
		};
	}

	/**
	 * Returns whether the quorum has achieved a consensus for the given key.
	 */
	public has(key: string): boolean {
		return this.quorumProposals.has(key);
	}

	/**
	 * Returns the consensus value for the given key
	 */
	public get(key: string): any {
		return this.quorumProposals.get(key);
	}

	/**
	 * Returns additional data about the approved consensus value
	 * @deprecated Removed in recent protocol-definitions.  Use get() instead.
	 */
	public getApprovalData(key: string): ICommittedProposal | undefined {
		return this.quorumProposals.getApprovalData(key);
	}

	/**
	 * Adds a new client to the quorum
	 */
	public addMember(clientId: string, details: ISequencedClient) {
		this.quorumClients.addMember(clientId, details);
	}

	/**
	 * Removes a client from the quorum
	 */
	public removeMember(clientId: string) {
		this.quorumClients.removeMember(clientId);
	}

	/**
	 * Retrieves all the members in the quorum
	 */
	public getMembers(): Map<string, ISequencedClient> {
		return this.quorumClients.getMembers();
	}

	/**
	 * Retrieves a specific member of the quorum
	 */
	public getMember(clientId: string): ISequencedClient | undefined {
		return this.quorumClients.getMember(clientId);
	}

	/**
	 * Proposes a new value. Returns a promise that will resolve when the proposal is either accepted, or reject if
	 * the proposal fails to send.
	 */
	public async propose(key: string, value: any): Promise<void> {
		return this.quorumProposals.propose(key, value);
	}

	/**
	 * Begins tracking a new proposal
	 */
	public addProposal(
		key: string,
		value: any,
		sequenceNumber: number,
		local: boolean,
		clientSequenceNumber: number,
	) {
		return this.quorumProposals.addProposal(
			key,
			value,
			sequenceNumber,
			local,
			clientSequenceNumber,
		);
	}

	/**
	 * Updates the minimum sequence number. If the MSN advances past the sequence number for any proposal then it
	 * becomes an approved value.
	 */
	public updateMinimumSequenceNumber(message: ISequencedDocumentMessage): void {
		this.quorumProposals.updateMinimumSequenceNumber(message);
	}

	public setConnectionState(connected: boolean, clientId?: string) {
		this.quorumProposals.setConnectionState(connected);
	}

	public dispose(): void {
		throw new Error("Not implemented.");
		this.isDisposed = true;
	}
}
