/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IAlfredTenant {
    id: string;
    key: string;
}

/**
 * Session information that includes the server urls and session status
 */
export interface ISession {
    /**
     * Orderer url of the session.
     */
    ordererUrl: string;
    /**
      * WebSocket server url of the session
      */
    deltaStreamUrl: string;
    /**
      * Historian url of the session
      */
    historianUrl: string;
    /**
     * Whether session is "alive".
     * Session is considered alive if it has been "discovered" via the HTTP endpoint
     * for session discovery, or via document creation. A session being "alive"
     * does not indicate whether there are any or have been any active session members.
     * Tracking "discovered" state in addition to "active" state avoids edge cases where
     * 2 clients attempt to join simulataneously and possibly discover different session locations.
     *
     * This could be better named as `isSessionDiscovered`,
     * but we must keep `isSessionAlive` for backwards compatibility.
     */
    isSessionAlive: boolean;
    /**
     * Whether session is "active".
     * Session is considered "active" if there has been activity within the last 10 minutes.
     * Activity time window is defined by `DefaultServiceConfiguration.documentLambda.partitionActivityTimeout`.
     */
    isSessionActive: boolean;
}
