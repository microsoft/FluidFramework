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

export interface ISave {
    message: string;
}

export interface IHelpMessage {

    tasks: string[];

    // Temporary version field for back-compat.
    version?: string;
}

export interface IQueueMessage {

    message: IHelpMessage;

    tenantId: string;

    documentId: string;

    token: string;
}

export interface IInboundSignalMessage extends ISignalMessage {

    type: string;

}
