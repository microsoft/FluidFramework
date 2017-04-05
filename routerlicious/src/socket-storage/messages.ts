/**
 * Base interface for messages sent between the client and server
 */
export interface IObjectMessage {
    // The collaborative object the operation is intended for
    objectId: string;

    // The client who is sending the message
    clientId: string;
}

/**
 * Message sent when a new operation is submitted to the server
 */
export interface ISubmitOpMessage extends IObjectMessage {
    // The operation being submitted
    op: any;
}

/**
 * Message sent to clients when an operation has been assigned a sequence number and is being routed to clients
 */
export interface IRoutedOpMessage extends IObjectMessage {
    // The client who submitted the operation
    clientId: string;

    // The operation being applied
    op: any;

    // The assigned sequence number
    sequenceNumber: number;
}

/**
 * Message sent when the client is looking to load or create a new collaborative object
 */
export interface ILoadObjectMessage extends IObjectMessage {
    // The type of object to be loaded
    type: string;

    // Initial data to represent the object
    initial: string;
}

/**
 * Message sent to indicate a client has connected to the server
 */
export interface IConnectedMessage {
    // Identifier to represent the connected client
    id: string;
}

/**
 * Structure to represent the response from processing a message
 */
export interface IResponse<T> {
    // If the operation failed this field will be non-null
    error: any;

    // The response data
    data: T;
}

/**
 * Details about a collaborative object
 */
export interface IObjectDetails {
    id: string;

    snapshot: any;

    type: string;
}
