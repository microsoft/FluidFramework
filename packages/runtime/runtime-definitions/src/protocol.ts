/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignalMessage, ITree } from "@fluidframework/protocol-definitions";

/**
 * An envelope wraps the contents with the intended target
 */
export interface IEnvelope {
    // The target for the envelope
    // undefined if target is container runtime itself
    address: string;

    // The contents of the envelope
    contents: any;
}

export interface ISignalEnvelop {
    // The target for the envelope, undefined for the container
    address?: string;

    // The contents of the envelope
    contents: any;
}

/**
 * Represents ISignalMessage with its type.
 */
export interface IInboundSignalMessage extends ISignalMessage {
    type: string;
}

/**
 * Message send by client attaching local data structure.
 * Contains snapshot of data structure which is the current state of this data structure.
 */
export interface IAttachMessage {
    // The identifier for the object
    id: string;

    // The type of object
    type: string;

    // Initial snapshot of the document (contains ownership)
    snapshot: ITree;
}

export interface IAliasProposalMessage {
    type: "aliasProposal";
    componentId: string;
    alias: string;
}

/**
 * Runtime message type - union of message interfaces
 * IAttachMessage should ideally move into this type.
 */
export type IRuntimeMessage = IAliasProposalMessage;
