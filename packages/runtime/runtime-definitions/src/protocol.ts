import { ISignalMessage } from "@prague/container-definitions";

/**
 * An envelope wraps the contents with the intended target
 */
export interface IEnvelope {
    // The target for the envelope
    address: string;

    // The contents of the envelope
    contents: any;
}

export interface IHelpMessage {

    tasks: string[];

    // Temporary version field for back-compat.
    version?: string;
}

/**
 * Represents a message in queue to be processed.
 */
export interface IQueueMessage {

    message: IHelpMessage;

    tenantId: string;

    documentId: string;

    token: string;
}

/**
 * Represents ISignalMessage with its type.
 */
export interface IInboundSignalMessage extends ISignalMessage {

    type: string;

}
