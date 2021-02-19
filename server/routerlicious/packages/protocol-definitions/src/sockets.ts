/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionMode, IClient, ISignalClient } from "./clients";
import { IClientConfiguration } from "./config";
import { ISequencedDocumentMessage, ISignalMessage } from "./protocol";
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

    /**
     * Represents the version of document at client. It should match the version on server
     * for connection to be successful.
     */
    epoch?: string;
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
     * Messages sent during the connection
     */
    initialMessages: ISequencedDocumentMessage[];

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
    serviceConfiguration: IClientConfiguration;

    /**
     * Connection mode of client.
     */
    mode: ConnectionMode;

    /**
     * An optional nonce used during connection to identify connection attempts
     */
    nonce?: string;

    /**
     * Last known sequence number to ordering service at the time of connection
     * It may lap actual last sequence number (quite a bit, if container  is very active).
     * But it's best information for client to figure out how far it is behind, at least
     * for "read" connections. "write" connections may use own "join" op to similar information,
     * that is likely to be more up-to-date.
     */
    checkpointSequenceNumber?: number;

    /**
     * Represents the version of document at server.
     */
    epoch?: string;
}
