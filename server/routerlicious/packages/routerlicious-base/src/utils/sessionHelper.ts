/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentSession, ISession } from "@fluidframework/server-services-client";
import { IDocument, ICollection } from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

export async function getSession(ordererUrl: string,
    historianUrl: string,
    tenantId: string,
    documentId: string,
    documentsCollection: ICollection<IDocument>): Promise<IDocumentSession> {
    const lumberjackProperties = getLumberBaseProperties(documentId, tenantId);

    const tempDocument: IDocument = await documentsCollection.findOne({ documentId });
    let tempSession: ISession = tempDocument.session;
    if (tempSession === undefined) {
        tempSession = {
            ordererUrl,
            historianUrl,
            isSessionAlive: true,
        };
        await documentsCollection.upsert(
            {
                documentId,
            },
            {
                deli: tempDocument.deli,
                scribe: tempDocument.scribe,
                session: tempSession,
            },
            {});
        Lumberjack.info(`The Session ${JSON.stringify(tempSession)} was inserted into the document collection`,
            lumberjackProperties);
    }

    const deli = JSON.parse(tempDocument.deli);
    const scribe = JSON.parse(tempDocument.scribe);
    let hasSessionLocationChanged: boolean = false;
    const isSessionAlive: boolean = tempSession !== undefined ? tempSession.isSessionAlive : true;
    if (tempSession !== null && !tempSession.isSessionAlive) {
        // Reset logOffset, ordererUrl, and historianUrl when switching cluster.
        if ((tempSession.ordererUrl !== null && tempSession.ordererUrl !== ordererUrl) ||
            (tempSession.historianUrl !== null && tempSession.historianUrl !== historianUrl)) {
            Lumberjack.info(`Reset logOffset, ordererUrl, and historianUrl when switching cluster.`,
                lumberjackProperties);
            deli.logOffset = -1;
            tempSession.ordererUrl = ordererUrl;
            tempSession.historianUrl = historianUrl;
            hasSessionLocationChanged = true;
            if (tempDocument.scribe !== "") {
                scribe.logOffset = -1;
            }
        }
        tempSession.isSessionAlive = true;
        await documentsCollection.upsert(
            {
                documentId,
            },
            {
                deli: JSON.stringify(deli),
                scribe: JSON.stringify(scribe),
                session: tempSession,
            },
            {});
    }

    // Assign the actual isSessionAlive flag to the returning documentSession
    tempSession.isSessionAlive = isSessionAlive;
    const documentSession: IDocumentSession = {
        id: documentId,
        hasSessionLocationChanged,
        session: tempSession,
    };
    Lumberjack.info(`Returning the documentSession: ${JSON.stringify(documentSession)}`, lumberjackProperties);
    return documentSession;
}
