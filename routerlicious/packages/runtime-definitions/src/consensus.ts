import { EventEmitter } from "events";
import { IClient } from "./clients";

/**
 * Proposal to set the given key/value pair.
 *
 * Consensus on the proposal is achieved if the MSN is >= the sequence number
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
export type ISequencedProposal = { sequenceNumber: number } & IProposal;

export interface IRejection {
    // The sequence number of the proposal being rejected
    sequenceNumber: number;
}

/**
 * Class representing agreed upon values in a quorum
 */
export interface IQuorum extends EventEmitter {
    propose(key: string, value: any): Promise<void>;

    has(key: string): boolean;

    get(key: string): any;

    getMembers(): Map<string, IClient>;
}
