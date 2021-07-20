/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Summary algorithm configuration
// A summary will occur either if
// * idleTime(ms) have passed without activity with pending ops to summarize
// * maxTime(ms) have passed with pending ops to summarize
// * maxOps are waiting to summarize
export interface ISummaryConfiguration {
    idleTime: number;

    maxTime: number;

    maxOps: number;

    maxAckWaitTime: number;
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
