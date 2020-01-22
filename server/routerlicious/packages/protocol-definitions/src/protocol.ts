/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

    // Summary op
    Summarize = "summarize",

    // Summary op written
    SummaryAck = "summaryAck",

    // Summary op write failure
    SummaryNack = "summaryNack",

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

    // Message to indicate that no active clients are present.
    NoClient = "noClient",

    // Message to indicate successful round trip.
    RoundTrip = "tripComplete",
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

    // App provided metadata about the operation
    metadata?: any;

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

    // App provided metadata about the operation
    metadata?: any;

    // Origin branch information for the message. Can be marked undefined if the current
    // message is also the origin.
    origin?: IBranchOrigin;

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

export interface ISummaryContent {
    // Handle reference to the summary data
    handle: string;

    // Message included as part of the summary
    message: string;

    // Handles to parent summaries of the proposed new summary
    parents: string[];

    // Handle to the current latest summary stored by the service
    head: string;

    // TODO - need an epoch/reload bit to indicate to clients that the summary has changed and requires a reload
    // This could be encoded in the summary itself as well but then would require the client to download it to check
}

/**
 * General errors returned from the server.
 * May want to add error code or something similar in the future.
 */
export interface IServerError {
    /**
     * Message describing the server error.
     */
    errorMessage: string;
}

/**
 * Data about the original proposed summary op.
 */
export interface ISummaryProposal {
    /**
     * Actual sequence number of the summary op proposal.
     */
    summarySequenceNumber: number;
}

/**
 * Contents of summary ack expected from the server.
 */
export interface ISummaryAck {
    /**
     * Handle of the complete summary.
     */
    handle: string;

    /**
     * Information about the proposed summary op.
     */
    summaryProposal: ISummaryProposal;
}

/**
 * Contents of summary nack expected from the server.
 */
export interface ISummaryNack extends IServerError {
    /**
     * Information about the proposed summary op.
     */
    summaryProposal: ISummaryProposal;
}

/**
 * Represents a message containing tasks.
 */
export interface IHelpMessage {

    tasks: string[];

    // Temporary version field for back-compat.
    version?: string;
}

/**
 * Represents a message in task queue to be processed.
 */
export interface IQueueMessage {

    message: IHelpMessage;

    tenantId: string;

    documentId: string;

    token: string;
}
