export enum DocumentEvents {
    /**
     * new updates have been pushed to the document
     */
    Update,

    /**
     * A new user has joined the document
     */
    UserJoined,

    /**
     * A user has left the document
     */
    UserLeft,
}

/**
 * API access to the underlying document stored on the server
 */
export interface IDocument {
    /**
     * Subscribe to events emitted by the document
     */
    on(event: DocumentEvents, listener: Function): this;

    /**
     * Detaches the document from the server and unsubscribes from all events.
     */
    detach();
}

/**
 * Server details of the document
 */
export interface IDocumentDetails {
    /**
     * Snapshot of the data returned during the initial load of the document
     */
    data: any;

    /**
     * The interface to the server document
     */
    document: IDocument;

    /**
     * Boolean indicating whether or not the loaded document already existed on the server
     */
    existing: boolean;

    /**
     * The type of the underlying document
     */
    type: string;
}

/**
 * The storage interface provides access to the backend system that is storing the underlying interactive
 * document. It can be used to create, load, and query interactive documents.
 */
export interface IStorage {
    /**
     * Creates or loads a new document with the given name
     */
    load(name: string): Promise<IDocumentDetails>;
}

export interface IOptions {
    /**
     * Access token to the storage system
     */
    token: string;
}

/**
 * Factory interface which provides access to connecting to a storage system
 */
export interface IStorageProvider {
    /**
     * Creates a connection to the given storage provider
     */
    connect(options: IOptions): Promise<IStorage>;
}