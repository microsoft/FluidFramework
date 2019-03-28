export enum MessageType {
    // Empty operation message. Used to send an updated reference sequence number.
    NoOp = "noop",

    // System message sent to indicate a new client has joined the collaboration
    ClientJoin = "join",

    // System message sent to indicate a client has left the collaboration
    ClientLeave = "leave",

    // Proposes a new consensus value
    Propose = "propose",

    // Message used to reject a pending proposal
    Reject = "reject",

    // Blob uploaded
    BlobUploaded = "blobUploaded",

    // TODO the attach and operation names are partially historican. We may want to rename to align with changes
    // coming from code loading.

    // Creates a new channel and attaches chaincode to it
    Attach = "attach",

    // Channel operation.
    Operation = "op",

    // Chunked operation.
    ChunkedOp = "chunkedOp",

    // Forced snapshot
    Save = "saveOp",

    // System message to indicate the creation of a new fork
    Fork = "fork",

    // Message sent when forwarding a sequenced message to an upstream branch
    Integrate = "integrate",

    // Message to indicate the need of a remote agent for a document.
    RemoteHelp = "remoteHelp",
}

export interface IChunkedOp {
    chunkId: number;

    totalChunks: number;

    contents: string;

    originalType: MessageType;
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

export interface INack {
    // The operation that was just nacked
    operation: IDocumentMessage;

    // The sequence number the client needs to catch up to
    sequenceNumber: number;
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
    traces?: ITrace[];
}

/**
 * Document Message with optional system level data field.
 */
export interface IDocumentSystemMessage extends IDocumentMessage {

    data: string;
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
 * Sequenced message for a distributed document
 */
export interface ISequencedDocumentMessage {
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

    // Timestamp when the server ticketed the message
    timestamp: number;
}

export interface ISequencedDocumentSystemMessage extends ISequencedDocumentMessage {
    data: string;
}

export interface IContentMessage {

    clientId: string;

    clientSequenceNumber: number;

    contents: string;
}

export interface ISignalMessage {

    clientId: string;

    content: any;
}
