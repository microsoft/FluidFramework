/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules, import/no-extraneous-dependencies
import cloneDeep from "lodash/cloneDeep";

import { assert, Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ICommittedProposal,
    IQuorumProposals,
    IQuorumProposalsEvents,
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
 * Snapshot format for a QuorumProposals
 */
export type QuorumProposalsSnapshot = {
    proposals: [number, ISequencedProposal, string[]][];
    values: [string, ICommittedProposal][];
};

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
