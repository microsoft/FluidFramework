import { IClient, IContentMessage, ISequencedDocumentMessage } from "@prague/container-definitions";

/**
 * Message sent to connect to the given object
 */
export interface IConnect {
    // The tenant ID for the document
    tenantId: string;

    // The document that is being connected to
    id: string;

    // Authorization token
    token: string;

    // Type of the client trying to connect
    client: IClient;
}

/**
 * Message sent to indicate a client has connected to the server
 *
 * TODO Is the below a connection to the actual Kafka stream?
 */
export interface IConnected {
    // The client who is sending the message
    clientId: string;

    // Whether or not this is an existing object
    existing: boolean;

    // Maximum size of a message before chunking is required
    maxMessageSize: number;

    // The parent branch for the document
    parentBranch: string;

    // Messages sent during the connection
    initialMessages?: ISequencedDocumentMessage[];

    // Contents sent during the connection
    initialContents?: IContentMessage[];
}

/**
 * Message sent to indicate that a shadow client has connected to the server.
 */
export interface IShadowConnected {
    // The client who is sending the message
    clientId: string;
}

/**
 * Message sent to connect to the given object
 */
export interface IWorker {
    // Worker Id.
    clientId: string;

    // Type
    type: string;
}
