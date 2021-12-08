/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Summary algorithm configuration
// A summary will occur either if
// * idleTime(ms) have passed without activity with pending ops to summarize, or
// * maxTime(ms) have passed with pending ops to summarize, or
// * maxOps are waiting to summarize
// AND
// * disableSummaries !== true
export interface ISummaryConfiguration {
    idleTime: number;

    maxTime: number;

    maxOps: number;

    maxAckWaitTime: number;

    disableSummaries?: boolean;
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
