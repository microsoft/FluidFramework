/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Session information that includes the server urls and session status in the document's metadata
export interface ISession {
    // Orderer url of the session
    ordererUrl: string;
    // Historian url of the session
    historianUrl: string;
    // Session status
    isSessionAlive: boolean;
}
