/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
     * The tenant ID for the document.
     */
    tenantId: string;

    /**
     * The document that is being connected to
     */
    id: string;

    /**
     * Authorization token
     */
    // TODO: Update this to use undefined instead of null.
    // eslint-disable-next-line @rushstack/no-new-null
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

    /**
     * A list of optional features that client supports.
     * Features supported might be service specific.
     * If we have standardized features across all services, they need to be exposed in more structured way.
     */
    // TODO: use `unknown` instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supportedFeatures?: Record<string, any>;

    /**
     * Properties that client can send to server to tell info about client environment. These are a bunch of properties
     * separated by ";" which server can log to better understand client environment etc.
     * Format: "prop1:val1;prop2:val2;prop3:val3"
     */
    relayUserAgent?: string;
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

    /**
     * A list of optional features that ordering service supports.
     * Features supported might be service specific.
     * If we have standardized features across all services, they need to be exposed in more structured way.
     */
    // TODO: use `unknown` instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supportedFeatures?: Record<string, any>;

    /**
     * The time the client connected
     */
    timestamp?: number;

    /**
     * Properties that server can send to client to tell info about node that client is connected to. For ex, for spo
     * it could contain info like build version, environment, region etc. These properties can be logged by client
     * to better understand server environment etc. and use it in case error occurs.
     * Format: "prop1:val1;prop2:val2;prop3:val3"
     */
    relayServiceAgent?: string;
}
