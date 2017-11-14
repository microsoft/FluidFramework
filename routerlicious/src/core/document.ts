export interface IFork {
    // The id of the fork
    id: string;

    // The sequence number where the fork originated. Will be undefined until the sync has completed setup.
    sequenceNumber: number;
}

export interface IDocument {
    _id: string;

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

    // Deli specific information - we might want to consolidate this into a field to separate it

    clients: [{
        clientId: string,

        referenceSequenceNumber: number,

        lastUpdate: number,
    }];

    sequenceNumber: number;

    logOffset: number;
}
