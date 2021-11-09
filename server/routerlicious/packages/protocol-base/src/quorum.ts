/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";

import { assert, Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ICommittedProposal,
    IPendingProposal,
    IQuorum,
    IQuorumEvents,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
} from "@fluidframework/protocol-definitions";

/**
 * Appends a deferred and rejection count to a sequenced proposal. For locally generated promises this allows us to
 * attach a Deferred which we will resolve once the proposal is either accepted or rejected.
 */
class PendingProposal implements IPendingProposal, ISequencedProposal {
    public readonly rejections: Set<string>;
    private canReject = true;

    constructor(
        private readonly sendReject: (sequenceNumber: number) => void,
        public sequenceNumber: number,
        public key: string,
        public value: any,
        rejections: string[],
        public deferred?: Deferred<void>) {
        this.rejections = new Set(rejections);
    }

    public reject() {
        if (!this.canReject) {
            throw new Error("Can no longer reject this proposal");
        }

        this.sendReject(this.sequenceNumber);
    }

    public get rejectionDisabled() {
        return !this.canReject;
    }

    public disableRejection() {
        this.canReject = false;
    }

    public addRejection(clientId: string) {
        assert(!this.rejections.has(clientId), 0x1cd /* `!this.rejections.has(${clientId})` */);
        this.rejections.add(clientId);
    }
}

export interface IQuorumSnapshot {
    members: [string, ISequencedClient][];
    proposals: [number, ISequencedProposal, string[]][];
    values: [string, ICommittedProposal][];
}

/**
 * A quorum represents all clients currently within the collaboration window. As well as the values
 * they have agreed upon and any pending proposals.
 */
export class Quorum extends TypedEventEmitter<IQuorumEvents> implements IQuorum {
    private readonly members: Map<string, ISequencedClient>;
    private readonly proposals: Map<number, PendingProposal>;
    private readonly values: Map<string, ICommittedProposal>;
    private isDisposed: boolean = false;
    public get disposed() { return this.isDisposed; }

    // List of commits that have been approved but not yet committed
    private readonly pendingCommit: Map<string, ICommittedProposal>;

    // Locally generated proposals
    private readonly localProposals = new Map<number, Deferred<void>>();

    /**
     * Cached snapshot state
     * The quorum consists of 3 properties: members, values, and proposals.
     * Depending on the op being processed, some or none of those properties may change.
     * Each property will be cached and the cache for each property will be cleared when an op causes a change.
     */
    private readonly snapshotCache: Partial<IQuorumSnapshot> = {};

    constructor(
        members: [string, ISequencedClient][],
        proposals: [number, ISequencedProposal, string[]][],
        values: [string, ICommittedProposal][],
        private readonly sendProposal: (key: string, value: any) => number,
        private readonly sendReject: (sequenceNumber: number) => void) {
        super();

        this.members = new Map(members);
        this.proposals = new Map(
            proposals.map(([, proposal, rejections]) => {
                return [
                    proposal.sequenceNumber,
                    new PendingProposal(
                        this.sendReject,
                        proposal.sequenceNumber,
                        proposal.key,
                        proposal.value,
                        rejections),
                ] as [number, PendingProposal];
            }));
        this.values = new Map(values);
        this.pendingCommit = new Map(values
            .filter((value) => value[1].commitSequenceNumber === -1));
    }

    public close() {
        this.removeAllListeners();
    }

    /**
     * Snapshots the entire quorum
     * @returns a quorum snapshot
     */
    public snapshot(): IQuorumSnapshot {
        this.snapshotCache.members ??= this.snapshotMembers();
        this.snapshotCache.proposals ??= this.snapshotProposals();
        this.snapshotCache.values ??= this.snapshotValues();

        return {
            ...this.snapshotCache as IQuorumSnapshot,
        };
    }

    /**
     * Snapshots quorum members
     * @returns a deep cloned array of members
     */
    public snapshotMembers(): IQuorumSnapshot["members"] {
        return cloneDeep(Array.from(this.members));
    }

    /**
     * Snapshots quorum proposals
     * @returns a deep cloned array of proposals
     */
    public snapshotProposals(): IQuorumSnapshot["proposals"] {
        return Array.from(this.proposals).map(
            ([sequenceNumber, proposal]) => [
                sequenceNumber,
                { sequenceNumber, key: proposal.key, value: proposal.value },
                Array.from(proposal.rejections)] as [number, ISequencedProposal, string[]]);
    }

    /**
     * Snapshots quorum values
     * @returns a deep cloned array of values
     */
    public snapshotValues(): IQuorumSnapshot["values"] {
        return cloneDeep(Array.from(this.values));
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
     */
    public getApprovalData(key: string): ICommittedProposal | undefined {
        const proposal = this.values.get(key);
        return proposal ? cloneDeep(proposal) : undefined;
    }

    /**
     * Adds a new client to the quorum
     */
    public addMember(clientId: string, details: ISequencedClient) {
        assert(!this.members.has(clientId), 0x1ce /* `!this.members.has(${clientId})` */);
        this.members.set(clientId, details);
        this.emit("addMember", clientId, details);

        // clear the members cache
        this.snapshotCache.members = undefined;
    }

    /**
     * Removes a client from the quorum
     */
    public removeMember(clientId: string) {
        assert(this.members.has(clientId), 0x1cf /* `this.members.has(${clientId})` */);
        this.members.delete(clientId);
        this.emit("removeMember", clientId);

        // clear the members cache
        this.snapshotCache.members = undefined;
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

    /**
     * Proposes a new value. Returns a promise that will resolve when the proposal is either accepted or rejected.
     *
     * TODO: Right now we will only submit proposals for connected clients and not attempt to resubmit on any
     * nack/disconnect. The correct answer for this should become more clear as we build scenarios on top of the loader.
     */
    public async propose(key: string, value: any): Promise<void> {
        const clientSequenceNumber = this.sendProposal(key, value);
        if (clientSequenceNumber < 0) {
            this.emit("error", { eventName: "ProposalInDisconnectedState", key });
            return Promise.reject(new Error("Can't proposal in disconnected state"));
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
            this.sendReject,
            sequenceNumber,
            key,
            value,
            [],
            local ? this.localProposals.get(clientSequenceNumber) : undefined);
        this.proposals.set(sequenceNumber, proposal);

        // Emit the event - which will also provide clients an opportunity to reject the proposal. We require
        // clients to make a rejection decision at the time of receiving the proposal and so disable rejecting it
        // after we have emitted the event.
        this.emit("addProposal", proposal);
        proposal.disableRejection();

        if (local) {
            this.localProposals.delete(clientSequenceNumber);
        }

        // clear the proposal cache
        this.snapshotCache.proposals = undefined;
    }

    /**
     * Rejects the given proposal
     */
    public rejectProposal(clientId: string, sequenceNumber: number) {
        // Proposals require unanimous approval so any rejection results in a rejection of the proposal. For error
        // detection we will keep a rejected proposal in the pending list until the MSN advances so that we can
        // track the total number of rejections.
        assert(this.proposals.has(sequenceNumber), 0x1d2 /* `this.proposals.has(${sequenceNumber})` */);

        const proposal = this.proposals.get(sequenceNumber);
        if (proposal !== undefined) {
            proposal.addRejection(clientId);
        }

        // clear the proposal cache
        this.snapshotCache.proposals = undefined;

        // We will emit approval and rejection messages once the MSN advances past the sequence number of the
        // proposal. This will allow us to convey all clients who rejected the proposal.
    }

    /**
     * Updates the minimum sequence number. If the MSN advances past the sequence number for any proposal without
     * a rejection then it becomes an accepted consensus value.  If the MSN advances past the sequence number
     * that the proposal was accepted, then it becomes a committed consensus value.
     * Returns true if immediate no-op is required.
     */
    public updateMinimumSequenceNumber(message: ISequencedDocumentMessage): boolean {
        let immediateNoOp = false;

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
            const approved = proposal.rejections.size === 0;

            // If it was a local proposal - resolve the promise
            if (proposal.deferred) {
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                approved
                    ? proposal.deferred.resolve()
                    : proposal.deferred.reject(`Rejected by ${Array.from(proposal.rejections)}`);
            }

            if (approved) {
                const committedProposal: ICommittedProposal = {
                    approvalSequenceNumber: message.sequenceNumber,
                    commitSequenceNumber: -1,
                    key: proposal.key,
                    sequenceNumber: proposal.sequenceNumber,
                    value: proposal.value,
                };

                // TODO do we want to notify when a proposal doesn't make it to the commit phase - i.e. because
                // a new proposal was made before it made it to the committed phase? For now we just will never
                // emit this message

                this.values.set(committedProposal.key, committedProposal);
                this.pendingCommit.set(committedProposal.key, committedProposal);

                // clear the values cache
                this.snapshotCache.values = undefined;

                // Send no-op on approval to expedite commit
                // accept means that all clients have seen the proposal and nobody has rejected it
                // commit means that all clients have seen that the proposal was accepted by everyone
                immediateNoOp = true;

                this.emit(
                    "approveProposal",
                    committedProposal.sequenceNumber,
                    committedProposal.key,
                    committedProposal.value,
                    committedProposal.approvalSequenceNumber);
            } else {
                this.emit(
                    "rejectProposal",
                    proposal.sequenceNumber,
                    proposal.key,
                    proposal.value,
                    Array.from(proposal.rejections));
            }

            this.proposals.delete(proposal.sequenceNumber);

            // clear the proposals cache
            this.snapshotCache.proposals = undefined;
        }

        // Move values to the committed stage and notify
        if (this.pendingCommit.size > 0) {
            Array.from(this.pendingCommit.values())
                .filter((pendingCommit) => pendingCommit.approvalSequenceNumber <= msn)
                .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
                .forEach((pendingCommit) => {
                    pendingCommit.commitSequenceNumber = message.sequenceNumber;

                    // clear the values cache
                    this.snapshotCache.values = undefined;

                    this.emit(
                        "commitProposal",
                        pendingCommit.sequenceNumber,
                        pendingCommit.key,
                        pendingCommit.value,
                        pendingCommit.approvalSequenceNumber,
                        pendingCommit.commitSequenceNumber);

                    this.pendingCommit.delete(pendingCommit.key);
                });
        }

        return immediateNoOp;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        if (!connected) {
            this.localProposals.forEach((deferral) => {
                deferral.reject(new Error("Client got disconnected"));
            });
            this.localProposals.clear();
        }
    }

    public dispose(): void {
        throw new Error("Not implemented.");
        this.isDisposed = true;
    }
}
