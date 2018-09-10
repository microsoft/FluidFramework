import { IHelpMessage, ITrace } from "@prague/runtime-definitions";

// Message to indicate successful round trip.
export const RoundTrip = "tripComplete";

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
