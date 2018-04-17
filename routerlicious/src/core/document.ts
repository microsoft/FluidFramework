import { IRangeTrackerSnapshot } from "../core-utils";

export interface IFork {
    // The id of the fork
    id: string;

    // The sequence number where the fork originated
    sequenceNumber: number;

    // The last forwarded sequence number
    lastForwardedSequenceNumber: number;
}

export interface IDocument {
    _id: string;

    createTime: number;

    forks: IFork[];

    /**
     * Parent references the point from which the document was branched
     */
    parent: {
        id: string,

        sequenceNumber: number,

        minimumSequenceNumber: number;
    };

    publicKey?: string;

    privateKey?: string;

    // TODO package up the below under some kind of deli object
    // Deli specific information - we might want to consolidate this into a field to separate it
    clients: [{
        // Whether deli is allowed to evict the client from the MSN queue (i.e. due to timeouts, etc...)
        canEvict: boolean,

        clientId: string,

        clientSequenceNumber: number,

        referenceSequenceNumber: number,

        lastUpdate: number,

        nack: boolean,
    }];

    branchMap: IRangeTrackerSnapshot;

    sequenceNumber: number;

    logOffset: number;
}
