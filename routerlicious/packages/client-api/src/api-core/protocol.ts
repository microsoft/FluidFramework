// Save Operation performed on a distributed data type, forces immediate snapshot
export const SaveOperation = "saveOp";

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

/**
 * Raw blob stored within the tree
 */
export interface IBlob {
    // Contents of the blob
    contents: string;

    // The encoding of the contents string (utf-8 or base64)
    encoding: string;
}
