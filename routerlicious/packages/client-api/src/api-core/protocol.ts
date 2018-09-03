import { ITree } from "@prague/runtime-definitions";

// Delta operation application type
export const OperationType = "op";

// Empty operation message. Used to send an updated reference sequence number.
export const NoOp = "noop";

// Operation performed on a distributed data type
export const ObjectOperation = "objOp";

// Save Operation performed on a distributed data type, forces immediate snapshot
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

export const BlobPrepared = "blobPrepared";

export const BlobUploaded = "blobUploaded";

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

export interface IAttachMessage {
    // The identifier for the object
    id: string;

    // The type of object
    type: string;

    // Initial snapshot of the document
    snapshot: ITree;
}

export interface IHelpMessage {

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

/**
 * Raw blob stored within the tree
 */
export interface IBlob {
    // Contents of the blob
    contents: string;

    // The encoding of the contents string (utf-8 or base64)
    encoding: string;
}
