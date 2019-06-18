/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICommittedProposal,
    IPendingProposal,
    IQuorum,
    ISequencedClient,
    ISequencedDocumentMessage,
    ISequencedProposal,
} from "@prague/container-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { debug } from "./debug";

// Appends a deferred and rejection count to a sequenced proposal. For locally generated promises this allows us to
// attach a Deferred which we will resolve once the proposal is either accepted or rejected.
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

    public disableRejection() {
        this.canReject = false;
    }

    public addRejection(clientId: string) {
        assert(!this.rejections.has(clientId));
        this.rejections.add(clientId);
    }
}

export interface IQuorumSnapshot {
    members: Array<[string, ISequencedClient]>;
    proposals: Array<[number, ISequencedProposal, string[]]>;
    values: Array<[string, ICommittedProposal]>;
}

/**
 * A quorum represents all clients currently within the collaboration window. As well as the values
 * they have agreed upon and any pending proposals.
 */
export class Quorum extends EventEmitter implements IQuorum {
    private readonly members: Map<string, ISequencedClient>;
    private readonly proposals: Map<number, PendingProposal>;
    private readonly values: Map<string, ICommittedProposal>;

    // List of commits that have been approved but not yet committed
    private readonly pendingCommit: Map<string, ICommittedProposal>;

    // Locally generated proposals
    private readonly localProposals = new Map<number, Deferred<void>>();

    constructor(
        private minimumSequenceNumber: number  | undefined,
        members: Array<[string, ISequencedClient]>,
        proposals: Array<[number, ISequencedProposal, string[]]>,
        values: Array<[string, ICommittedProposal]>,
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

    public snapshot(): IQuorumSnapshot {
        const serializedProposals = Array.from(this.proposals).map(
            ([sequenceNumber, proposal]) => {
                return [
                    sequenceNumber,
                    { sequenceNumber, key: proposal.key, value: proposal.value },
                    Array.from(proposal.rejections)] as [number, ISequencedProposal, string[]];
            });

        return {
            members: [...this.members],
            proposals: serializedProposals,
            values: [...this.values],
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
            return keyMap.value;
        }
    }

    /**
     * Adds a new client to the quorum
     */
    public addMember(clientId: string, details: ISequencedClient) {
        assert(!this.members.has(clientId));
        this.members.set(clientId, details);
        this.emit("addMember", clientId, details);
    }

    /**
     * Removes a client from the quorum
     */
    public removeMember(clientId: string) {
        assert(this.members.has(clientId), `this.members.has(${clientId})`);
        this.members.delete(clientId);
        this.emit("removeMember", clientId);
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
    /* tslint:disable:promise-function-async */
    public propose(key: string, value: any): Promise<void> {
        const clientSequenceNumber = this.sendProposal(key, value);
        if (clientSequenceNumber < 0) {
            return Promise.reject(false);
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

        assert(!this.proposals.has(sequenceNumber));
        assert(!local || this.localProposals.has(clientSequenceNumber));

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
    }

    /**
     * Rejects the given proposal
     */
    public rejectProposal(clientId: string, sequenceNumber: number): void {
        // Proposals require unanimous approval so any rejection results in a rejection of the proposal. For error
        // detection we will keep a rejected proposal in the pending list until the MSN advances so that we can
        // track the total number of rejections.
        assert(this.proposals.has(sequenceNumber));

        const proposal = this.proposals.get(sequenceNumber);
        if (proposal !== undefined) {
            proposal.addRejection(clientId);
        }

        // We will emit approval and rejection messages once the MSN advances past the sequence number of the
        // proposal. This will allow us to convey all clients who rejected the proposal.

        return;
    }

    public on(event: "addMember", listener: (clientId: string, details: ISequencedClient) => void): this;
    public on(event: "removeMember", listener: (clientId: string) => void): this;
    public on(event: "addProposal", listener: (proposal: IPendingProposal) => void): this;
    public on(
        event: "approveProposal",
        listener: (sequenceNumber: number, key: string, value: any, approvalSequenceNumber: number) => void): this;
    public on(
        event: "commitProposal",
        listener: (
            sequenceNumber: number,
            key: string,
            value: any,
            approvalSequenceNumber: number,
            commitSequenceNumber: number) => void): this;
    public on(
        event: "rejectProposal",
        listener: (sequenceNumber: number, key: string, value: any, rejections: string[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Updates the minimum sequence number. If the MSN advances past the sequence number for any proposal without
     * a rejection then it becomes an accepted consensus value.
     */
    public updateMinimumSequenceNumber(message: ISequencedDocumentMessage): void {
        const value = message.minimumSequenceNumber;
        if (this.minimumSequenceNumber !== undefined) {
            assert(value >= this.minimumSequenceNumber);
        }
        if (this.minimumSequenceNumber === value) {
            return;
        }

        this.minimumSequenceNumber = value;

        // Accept proposals and reject proposals whose sequenceNumber is <= the minimumSequenceNumber

        // Return a sorted list of approved proposals. We sort so that we apply them in their sequence number order
        // TODO this can be optimized if necessary to avoid the linear search+sort
        const completed = new Array<PendingProposal>();
        for (const [sequenceNumber, proposal] of this.proposals) {
            if (sequenceNumber <= this.minimumSequenceNumber) {
                debug(`Quorum proposal SN# ${sequenceNumber} Completed`);
                completed.push(proposal);
            }
        }
        completed.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        for (const proposal of completed) {
            const approved = proposal.rejections.size === 0;

            // If it was a local proposal - resolve the promise
            if (proposal.deferred) {
                approved
                    ? proposal.deferred.resolve()
                    : proposal.deferred.reject(`Rejected by ${Array.from(proposal.rejections)}`);
            }

            if (approved) {
                /* tslint:disable:no-object-literal-type-assertion */
                const committedProposal = {
                    approvalSequenceNumber: message.sequenceNumber,
                    commitSequenceNumber: -1,
                    key: proposal.key,
                    sequenceNumber: proposal.sequenceNumber,
                    value: proposal.value,
                } as ICommittedProposal;

                // TODO do we want to notify when a proposal doesn't make it to the commit phase - i.e. because
                // a new proposal was made before it made it to the committed phase? For now we just will never
                // emit this message

                this.values.set(committedProposal.key, committedProposal);
                this.pendingCommit.set(committedProposal.key, committedProposal);

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
        }

        // Move values to the committed stage and notify
        if (this.pendingCommit.size > 0) {
            Array.from(this.pendingCommit.values())
                .filter((pendingCommit) => pendingCommit.approvalSequenceNumber <= value)
                .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
                .forEach((pendingCommit) => {
                    pendingCommit.commitSequenceNumber = message.sequenceNumber;

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
    }
}
