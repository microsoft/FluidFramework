/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionMode, IClient, ISignalClient } from "./clients";
import { IServiceConfiguration } from "./config";
import { IContentMessage, ISequencedDocumentMessage, ISignalMessage } from "./protocol";
import { ITokenClaims } from "./tokens";

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

    /**
     * Connection mode of client.
     */
    mode: ConnectionMode;

    /**
     * An optional nonce used during connection to identify connection attempts
     */
    nonce?: string;
}

/**
 * Message sent to indicate a client has connected to the server
 */
export interface IConnected {
    /**
     * Claims for the client
     */
    claims: ITokenClaims;

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
    initialMessages: ISequencedDocumentMessage[];

    /**
     * Contents sent during the connection
     */
    initialContents: IContentMessage[];

    /**
     * Signals sent during the connection
     */
    initialSignals: ISignalMessage[];

    /**
     * Prior clients already connected.
     */
    initialClients: ISignalClient[];

    /**
     * Protocol version selected by the server to communicate with the client
     */
    version: string;

    /**
     * List of protocol versions supported by the server
     */
    supportedVersions: string[];

    /**
     * Configuration details provided by the service
     */
    serviceConfiguration: IServiceConfiguration;

    /**
     * Connection mode of client.
     */
    mode: ConnectionMode;

    /**
     * An optional nonce used during connection to identify connection attempts
     */
    nonce?: string;
}
