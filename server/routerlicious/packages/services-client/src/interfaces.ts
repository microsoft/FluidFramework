/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IAlfredTenant {
    id: string;
    key: string;
}

// Session information that includes the server urls and session status
export interface ISession {
    // Orderer url of the session
    ordererUrl: string;
    // Historian url of the session
    historianUrl: string;
    // Session status
    isSessionAlive: boolean;
}
