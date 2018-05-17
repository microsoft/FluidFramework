import { ITenantUser } from "../api-core";

/**
 * Message sent to connect to the given object
 */
export interface IConnect {
    // The tenant ID for the document
    tenantId: string;

    // The document that is being connected to
    id: string;

    // authorization token
    token: string;
}

/**
 * Message sent to indicate a client has connected to the server
 *
 * TODO Is the below a connection to the actual Kafka stream?
 */
export interface IConnected {
    // The user who is sending the message
    user: ITenantUser;

    // The client who is sending the message
    clientId: string;

    // Whether or not this is an existing object
    existing: boolean;

    // The parent branch for the document
    parentBranch: string;
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
