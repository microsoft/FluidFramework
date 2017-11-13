export interface IFork {
    // The id of the fork
    id: string;

    // The sequence number where the fork originated. Will be undefined until the sync has completed setup.
    sequenceNumber: number;
}

export interface IDocument {
    _id: string;

    forks: IFork[];
}
