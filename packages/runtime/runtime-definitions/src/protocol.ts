/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignalMessage } from "@microsoft/fluid-protocol-definitions";

/**
 * An envelope wraps the contents with the intended target
 */
export interface IEnvelope {
    // The target for the envelope
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
