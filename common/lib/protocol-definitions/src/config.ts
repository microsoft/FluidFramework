/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 *  Summary algorithm configuration
 * A summary will occur either if
 * idleTime(ms) have passed without activity with pending ops to summarize
 * maxTime(ms) have passed with pending ops to summarize
 * maxOps are waiting to summarize
 * generateSummaries is undefined or false
 */
export interface ISummaryConfiguration {
    idleTime: number;

    maxTime: number;

    maxOps: number;

    maxAckWaitTime: number;

    /**
     * Flag that will generate summaries if connected to a service that supports them.
     * This defaults to true and must be explicitly set to false to disable.
     */
     generateSummaries?: boolean;
}

/**
 * Key value store of service configuration properties provided to the client as part of connection
 */
export interface IClientConfiguration {
    // Max message size the server will accept before requiring chunking
    maxMessageSize: number;

    // Server defined ideal block size for storing snapshots
    blockSize: number;

    // Summary algorithm configuration. This is sent to clients when they connect
    summary: ISummaryConfiguration;
}
