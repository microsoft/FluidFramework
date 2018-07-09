import * as storage from "./storage";

// Delta operation application type
export const OperationType = "op";

// Empty operation message. Used to send an updated reference sequence number.
export const NoOp = "noop";

// Operation performed on a distributed data type
export const ObjectOperation = "objOp";

// Save Operation performed on a distributed data type
export const SaveOperation = "saveOp";

// Attaches a new object to the document
export const AttachObject = "attach";

// System message sent to indicate a new client has joined the collaboration
export const ClientJoin = "join";

// System message sent to indicate a client has left the collaboration
export const ClientLeave = "leave";

// System message to indicate the creation of a new fork
export const Fork = "fork";

// Message sent when forwarding a sequenced message to an upstream branch
export const Integrate = "integrate";

// Message to indicate successful round trip.
export const RoundTrip = "tripComplete";

// Message to indicate the need of a remote agent for a document.
export const RemoteHelp = "remoteHelp";

/**
 * An envelope wraps the contents with the intended target
 */
export interface IEnvelope {
    // The target for the envelope
    address: string;

    // The contents of the envelope
    contents: any;
}

/**
 * Branch origin information
 */
export interface IBranchOrigin {
    // Origin branch of the message
    id: string;

    // Sequence number for the message in branch id
    sequenceNumber: number;

    // Min sequence number for the message in branch id
    minimumSequenceNumber: number;
}

/**
 * Messages to track latency trace
 */
export interface ITrace {
    // Service generating the trace.
    service: string;

    // Denotes receiving/sending.
    action: string;

    // Floating point time in milliseconds with up to nanosecond precision
    timestamp: number;
}

/**
 * Message related to a distributed data type
 */
export interface IObjectMessage {
    // The object's client sequence number
    clientSequenceNumber: number;

    // The reference object sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of message for the object
    type: string;

    // The operation to perform on the object
    contents: any;
}

/**
 * Sequenced message for a distributed data type
 */
export interface ISequencedObjectMessage {
    // User who sent the message.
    user: ITenantUser;

    // The sequenced identifier
    sequenceNumber: number;

    // The minimum sequence number for all connected clients
    minimumSequenceNumber: number;

    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The client ID that submitted the delta
    clientId: string;

    // The type of operation
    type: string;

    // The contents of the message
    contents: any;

    // Origin branch information for the message. Can be marked undefined if the current
    // message is also the origin.
    origin: IBranchOrigin;

    // Traces related to the packet.
    traces: ITrace[];
}

export interface IAttachMessage {
    // The identifier for the object
    id: string;

    // The type of object
    type: string;

    // Initial snapshot of the document
    snapshot: storage.ITree;
}

export interface IHelpMessage {

    clientId: string;

    tasks: string[];
}

export interface IQueueMessage {

    message: IHelpMessage;

    tenantId: string;

    documentId: string;

    token: string;
}

export interface ILatencyMessage {
    // Latency traces.
    traces: ITrace[];
}

export interface IPingMessage {
    // Whether ping is acked or not.
    acked: boolean;

    // Traces for the ping.
    traces: ITrace[];
}

/**
 * Document specific message
 */
export interface IDocumentMessage {
    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of document message being sent
    type: string;

    // The contents of the message
    contents: any;

    // Traces related to the packet.
    traces: ITrace[];
}

export interface INack {
    // The operation that was just nacked
    operation: IDocumentMessage;

    // The sequence number the client needs to catch up to
    sequenceNumber: number;
}

/**
 * Sequenced message for a distribute document
 */
export interface ISequencedDocumentMessage {
    // The user that submitted the delta
    user: ITenantUser;

    // The client ID that submitted the delta
    clientId: string;

    // The sequenced identifier
    sequenceNumber: number;

    // The minimum sequence number for all connected clients
    minimumSequenceNumber: number;

    // The document's client sequence number
    clientSequenceNumber: number;

    // The reference sequence number the message was sent relative to
    referenceSequenceNumber: number;

    // The type of operation
    type: string;

    // The contents of the message
    contents: any;

    // Origin branch information for the message. Can be marked undefined if the current
    // message is also the origin.
    origin: IBranchOrigin;

    // Traces related to the packet.
    traces: ITrace[];
}

export interface ITenantUser {
    id: string;
    name?: string;
}

// Find a home for this
export interface ITokenClaims {
    documentId: string;
    permission: string;
    tenantId: string;
    user: ITenantUser;
}
