/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IClient, IContentMessage, ISequencedDocumentMessage, ISignalMessage } from "@prague/container-definitions";

/**
 * Message sent to connect to the given document
 */
export interface IConnect {
    /**
     *  The tenant ID for the document
     */
    tenantId: string;

    /**
     * The document that is being connected to
     */
    id: string;

    /**
     * Authorization token
     */
    token: string | null;

    /**
     * Type of the client trying to connect
     */
    client: IClient;

    /**
     * Semver list of protocol versions supported by the client ordered in priority of use
     */
    versions: string[];
}

/**
 * Message sent to indicate a client has connected to the server
 */
export interface IConnected {
    /**
     * The client who is sending the message
     */
    clientId: string;

    /**
     * Whether or not this is an existing document
     */
    existing: boolean;

    /**
     * Maximum size of a message before chunking is required
     */
    maxMessageSize: number;

    /**
     * The parent branch for the document
     */
    parentBranch: string | null;

    /**
     * Messages sent during the connection
     */
    initialMessages?: ISequencedDocumentMessage[];

    /**
     * Contents sent during the connection
     */
    initialContents?: IContentMessage[];

    /**
     * Signals sent during the connection
     */
    initialSignals?: ISignalMessage[];

    /**
     * Protocol version selected by the server to communicate with the client
     */
    version: string;

    /**
     * List of protocol versions supported by the server
     */
    supportedVersions: string[];
}

/**
 * Message sent to indicate that a shadow client has connected to the server.
 */
export interface IShadowConnected {
    /**
     * The client who is sending the message
     */
    clientId: string;
}
