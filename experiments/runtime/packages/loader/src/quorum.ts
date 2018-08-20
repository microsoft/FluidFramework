import { IClient, ISequencedProposal } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";

export interface IPendingProposal extends ISequencedProposal {
    reject();
}

// Appends a deferred and rejection count to a sequenced proposal. For locally generated promises this allows us to
// attach a Deferred which we will resolve once the proposal is either accepted or rejected.
class PendingProposal implements IPendingProposal, ISequencedProposal {
    public rejections: Set<string>;
    private canReject = true;

    constructor(
        private sendReject: (sequenceNumber: number) => void,
        public sequenceNumber: number,
        public key: string,
        public value: any,
        public deferred?: Deferred<void>) {
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
        if (!this.rejections) {
            this.rejections = new Set();
        }

        assert(!this.rejections.has(clientId));
        this.rejections.add(clientId);
    }
}

/**
 * A quorum represents all clients currently within the collaboration window. As well as the values
 * they have agreed upon and any pending proposals.
 */
export class Quorum extends EventEmitter {
    private members: Map<string, IClient>;
    private proposals: Map<number, PendingProposal>;
    private values: Map<string, any>;

    // Locally generated proposals
    private localProposals = new Map<number, Deferred<void>>();

    constructor(
        private minimumSequenceNumber: number,
        members: Array<[string, IClient]>,
        proposals: ISequencedProposal[],
        values: Array<[string, any]>,
        private sendProposal: (key: string, value: any) => number,
        private sendReject: (sequenceNumber: number) => void) {
        super();

        this.members = new Map(members);
        this.proposals = new Map(
            proposals.map((proposal) => {
                return [
                    proposal.sequenceNumber,
                    new PendingProposal(this.sendReject, proposal.sequenceNumber, proposal.key, proposal.value),
                ] as [number, PendingProposal];
            }));
        this.values = new Map(values);
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
        return this.values.get(key);
    }

    /**
     * Adds a new client to the quorum
     */
    public addMember(clientId: string, details: IClient) {
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
    public getMembers(): Map<string, IClient> {
        return new Map(this.members);
    }

    /**
     * Proposes a new value. Returns a promise that will resolve when the proposal is either accepted or rejected.
     *
     * TODO: Right now we will only submit proposals for connected clients and not attempt to resubmit on any
     * nack/disconnect. The correct answer for this should become more clear as we build scenarios on top of the loader.
     */
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
    public rejectProposal(clientId: string, sequenceNumber: number) {
        // Proposals require unanimous approval so any rejection results in a rejection of the proposal. For error
        // detection we will keep a rejected proposal in the pending list until the MSN advances so that we can
        // track the total number of rejections.
        assert(this.proposals.has(sequenceNumber));

        const proposal = this.proposals.get(sequenceNumber);
        proposal.addRejection(clientId);

        // We will emit approval and rejection messages once the MSN advances past the sequence number of the
        // proposal. This will allow us to convey all clients who rejected the proposal.

        return;
    }

    public on(event: "addMember", listener: (clientId: string, details: IClient) => void): this;
    public on(event: "removeMember", listener: (clientId: string) => void): this;
    public on(event: "addProposal", listener: (proposal: IPendingProposal) => void): this;
    public on(event: "approveProposal", listener: (sequenceNumber: number, key: string, value: any) => void): this;
    public on(
        event: "rejectProposal",
        listener: (sequenceNumber: number, key: string, value: any, rejections: string[]) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Updates the minimum sequence number. If the MSN advances past the sequence number for any proposal without
     * a rejection then it becomes an accepted consensus value.
     */
    public updateMinimumSequenceNumber(value: number) {
        assert(value >= this.minimumSequenceNumber);
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
                console.log(`${sequenceNumber} Completed`);
                completed.push(proposal);
            }
        }
        completed.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

        for (const proposal of completed) {
            const approved = !proposal.rejections;

            // If it was a local proposal - resolve the promise
            if (proposal.deferred) {
                approved
                    ? proposal.deferred.resolve()
                    : proposal.deferred.reject(`Rejected by ${Array.from(proposal.rejections)}`);
            }

            if (approved) {
                this.values.set(proposal.key, proposal.value);
                this.emit(
                    "approveProposal",
                    proposal.sequenceNumber,
                    proposal.key,
                    proposal.value);
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
    }
}
