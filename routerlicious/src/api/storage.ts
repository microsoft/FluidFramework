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
 * Interface which provides access to the underlying object on the server
 */
export interface IStorageObject {
    /**
     * ID for the collaborative object
     */
    id: string;

    /**
     * The type of the underlying object
     */
    type: string;

    /**
     * The storage this object is associated with
     */
    storage: IStorage;

    /**
     * Subscribe to events emitted by the document
     */
    on(event: string, listener: Function): this;

    /**
     * Send new messages to the server
     */
    emit(event: string, ...args: any[]): boolean;

    /**
     * Detaches the document from the server and unsubscribes from all events.
     */
    detach();
}

/**
 * Values returned from a call to create a new collaborative object
 */
export interface ICollaborativeObjectDetails {
    /**
     * The current snapshot for the document
     */
    snapshot: any;

    /**
     * The server resource fro the given collaborative object
     */
    object: IStorageObject;
}

/**
 * The storage interface provides access to the backend system that is storing the underlying interactive
 * document. It can be used to create, load, and query interactive documents.
 */
export interface IStorage {
    /**
     * Creates or loads a new collaborative object with the given id and type
     */
    loadObject(id: string, type: string): Promise<ICollaborativeObjectDetails>;
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
