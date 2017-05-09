/**
 * Message sent to connect to the given object
 */
export interface IConnect {
    // The collaborative object the operation is intended for
    objectId: string;

    // The type of the collaborative object
    type: string;
}

/**
 * Message sent to indicate a client has connected to the server
 */
export interface IConnected {
    // The client who is sending the message
    clientId: string;

    // Whether or not this is an existing object
    existing: boolean;
}
