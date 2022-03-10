/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IDocumentSession {
    documentId: string;

    hasSessionLocationChanged: boolean;

    session: ISession;
}

export interface ISession {
    ordererUrl: string;

    historianUrl: string;

    isSessionAlive: boolean;
}
