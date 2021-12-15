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

    /* noopTimeFrequency & noopCountFrequency control how often client with "write" connection needs to send
     * noop messages in case no other ops are being sent by such client. Any op (including noops) result in client
     * communicating its reference sequence number to relay service, which can recalculate MSN based on new info.
     * Client send noop when either noopTimeFrequency ms elapsed from receiving last op or client received
     * noopCountFrequency ops.
     * If no value is provided, client choses some reasonable value
     */
     noopTimeFrequency?: number;

     /**
      * Set min op frequency with which noops would be sent in case of active connection which is not sending any op.
      * Please see noopTimeFrequency comment for more details.
      * If no value is provided, client choses some reasonable value
      */
     noopCountFrequency?: number;
}
