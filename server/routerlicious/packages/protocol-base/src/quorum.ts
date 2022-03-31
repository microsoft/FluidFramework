/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";

import { assert, Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ICommittedProposal,
    IQuorum,
    IQuorumClients,
    IQuorumClientsEvents,
    IQuorumEvents,
    IQuorumProposals,
    IQuorumProposalsEvents,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
} from "@fluidframework/protocol-definitions";

/**
 * Appends a deferred and rejection count to a sequenced proposal. For locally generated promises this allows us to
 * attach a Deferred which we will resolve once the proposal is either accepted or rejected.
 */
class PendingProposal implements ISequencedProposal {
    constructor(
        public sequenceNumber: number,
        public key: string,
        public value: any,
        public deferred?: Deferred<void>) {
    }
}

/**
 * Snapshot format for a QuorumClients
 */
export type QuorumClientsSnapshot = [string, ISequencedClient][];

/**
 * Snapshot format for a QuorumProposals
 */
export type QuorumProposalsSnapshot = {
    proposals: [number, ISequencedProposal, string[]][];
    values: [string, ICommittedProposal][];
};

/**
 * Snapshot format for a Quorum
 */
export interface IQuorumSnapshot {
    members: QuorumClientsSnapshot;
    proposals: QuorumProposalsSnapshot["proposals"];
    values: QuorumProposalsSnapshot["values"];
}

/**
 * The QuorumClients is used to track members joining and leaving the collaboration session.
 */
export class QuorumClients extends TypedEventEmitter<IQuorumClientsEvents> implements IQuorumClients {
    private readonly members: Map<string, ISequencedClient>;
    private isDisposed: boolean = false;
    public get disposed() { return this.isDisposed; }

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
        this.snapshotCache ??= cloneDeep(Array.from(this.members));

        return this.snapshotCache;
    }

    /**
     * Adds a new client to the quorum
     */
    public addMember(clientId: string, details: ISequencedClient) {
        assert(!this.members.has(clientId), 0x1ce /* `!this.members.has(${clientId})` */);
        this.members.set(clientId, details);
        this.emit("addMember", clientId, details);

        // clear the cache
        this.snapshotCache = undefined;
    }

    /**
     * Removes a client from the quorum
     */
    public removeMember(clientId: string) {
        assert(this.members.has(clientId), 0x1cf /* `this.members.has(${clientId})` */);
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
 */
export class QuorumProposals extends TypedEventEmitter<IQuorumProposalsEvents> implements IQuorumProposals {
    private readonly proposals: Map<number, PendingProposal>;
    private readonly values: Map<string, ICommittedProposal>;
    private isDisposed: boolean = false;
    public get disposed() { return this.isDisposed; }

    // Locally generated proposals
    private readonly localProposals = new Map<number, Deferred<void>>();

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
                    ),
                ] as [number, PendingProposal];
            }));
        this.values = new Map(snapshot.values);
        this.proposalsSnapshotCache = snapshot.proposals;
        this.valuesSnapshotCache = snapshot.values;
    }

    /**
     * Snapshots the current state of the QuorumProposals
     * @returns deep cloned arrays of proposals and values
     */
    public snapshot(): QuorumProposalsSnapshot {
        this.proposalsSnapshotCache ??= Array.from(this.proposals).map(
            ([sequenceNumber, proposal]) => [
                sequenceNumber,
                { sequenceNumber, key: proposal.key, value: proposal.value },
                [], // rejections, which has been removed
            ],
        );
        this.valuesSnapshotCache ??= cloneDeep(Array.from(this.values));

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
        const keyMap = this.values.get(key);
        if (keyMap !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return keyMap.value;
        }
    }

    /**
     * Returns additional data about the approved consensus value
     * @deprecated Removed in recent protocol-definitions.  Use get() instead.
     */
    public getApprovalData(key: string): ICommittedProposal | undefined {
        const proposal = this.values.get(key);
        return proposal ? cloneDeep(proposal) : undefined;
    }

    /**
     * Proposes a new value. Returns a promise that will resolve when the proposal is either accepted or rejected.
     */
    public async propose(key: string, value: any): Promise<void> {
        const clientSequenceNumber = this.sendProposal(key, value);
        if (clientSequenceNumber < 0) {
            this.emit("error", { eventName: "ProposalInDisconnectedState", key });
            throw new Error("Can't propose in disconnected state");
        }

        const deferred = new Deferred<void>();
        this.localProposals.set(clientSequenceNumber, deferred);
        return deferred.promise;
    }

    /**
     * Begins tracking a new proposal
     */
    public addProposal(
        key: string,
        value: any,
        sequenceNumber: number,
        local: boolean,
        clientSequenceNumber: number) {
        assert(!this.proposals.has(sequenceNumber), 0x1d0 /* `!this.proposals.has(${sequenceNumber})` */);
        assert(
            !local || this.localProposals.has(clientSequenceNumber),
            0x1d1 /* `!${local} || this.localProposals.has(${clientSequenceNumber})` */);

        const proposal = new PendingProposal(
            sequenceNumber,
            key,
            value,
            local ? this.localProposals.get(clientSequenceNumber) : undefined,
        );
        this.proposals.set(sequenceNumber, proposal);

        // Emit the event - which will also provide clients an opportunity to reject the proposal. We require
        // clients to make a rejection decision at the time of receiving the proposal and so disable rejecting it
        // after we have emitted the event.
        this.emit("addProposal", proposal);

        if (local) {
            this.localProposals.delete(clientSequenceNumber);
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

        // Accept proposals and reject proposals whose sequenceNumber is <= the minimumSequenceNumber

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
            // If it was a local proposal - resolve the promise
            proposal.deferred?.resolve();

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

            this.emit(
                "approveProposal",
                committedProposal.sequenceNumber,
                committedProposal.key,
                committedProposal.value,
                committedProposal.approvalSequenceNumber);

            this.proposals.delete(proposal.sequenceNumber);

            // clear the proposals cache
            this.proposalsSnapshotCache = undefined;
        }
    }

    public setConnectionState(connected: boolean) {
        if (!connected) {
            this.localProposals.forEach((deferral) => {
                deferral.reject(new Error("Client got disconnected"));
            });
            this.localProposals.clear();
        }
    }

    public dispose(): void {
        this.localProposals.forEach((deferral) => {
            deferral.reject(new Error("QuorumProposals was disposed"));
        });
        this.localProposals.clear();
        this.isDisposed = true;
    }
}

/**
 * A quorum represents all clients currently within the collaboration window. As well as the values
 * they have agreed upon and any pending proposals.
 */
export class Quorum extends TypedEventEmitter<IQuorumEvents> implements IQuorum {
    private readonly quorumClients: QuorumClients;
    private readonly quorumProposals: QuorumProposals;
    private isDisposed: boolean = false;
    public get disposed() { return this.isDisposed; }

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
     * Proposes a new value. Returns a promise that will resolve when the proposal is either accepted or rejected.
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
        return this.quorumProposals.addProposal(key, value, sequenceNumber, local, clientSequenceNumber);
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
