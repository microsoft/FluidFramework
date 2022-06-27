/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISession, NetworkError } from "@fluidframework/server-services-client";
import { IDocument, ICollection } from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Return to the caller with the status of the session.
 */
export async function getSession(ordererUrl: string,
    historianUrl: string,
    tenantId: string,
    documentId: string,
    documentsCollection: ICollection<IDocument>): Promise<ISession> {
    const lumberjackProperties = getLumberBaseProperties(documentId, tenantId);

    const tempDocument: IDocument = await documentsCollection.findOne({ tenantId, documentId });
    if (!tempDocument || tempDocument.scheduledDeletionTime !== undefined) {
        throw new NetworkError(404, "Document is deleted and cannot be accessed.");
    }
    let tempSession: ISession = tempDocument.session;
    if (!tempSession) {
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

    let tempDeli = tempDocument.deli;
    let tempScribe = tempDocument.scribe;
    const isSessionAlive: boolean = tempSession ? tempSession.isSessionAlive : true;
    if (tempSession && !tempSession.isSessionAlive) {
        // Reset logOffset, ordererUrl, and historianUrl when switching cluster.
        if ((tempSession.ordererUrl !== undefined && tempSession.ordererUrl !== ordererUrl) ||
            (tempSession.historianUrl !== undefined && tempSession.historianUrl !== historianUrl)) {
            Lumberjack.info(`Reset logOffset, ordererUrl, and historianUrl when switching cluster.`,
                lumberjackProperties);
            const deli = JSON.parse(tempDeli);
            deli.logOffset = -1;
            tempDeli = JSON.stringify(deli);
            tempSession.ordererUrl = ordererUrl;
            tempSession.historianUrl = historianUrl;
            if (tempDocument.scribe !== "") {
                const scribe = JSON.parse(tempScribe);
                scribe.logOffset = -1;
                tempScribe = JSON.stringify(scribe);
            }
        }

        // Update the status to isSessionAlive, since the session is now active.
        tempSession.isSessionAlive = true;
        await documentsCollection.upsert(
            {
                documentId,
            },
            {
                deli: tempDeli,
                scribe: tempScribe,
                session: tempSession,
            },
            {});
    }

    // The tempSession.isSessionAlive would be updated as whether the session was alive before the request came.
    tempSession.isSessionAlive = isSessionAlive;
    Lumberjack.info(`Returning the session from the discovery: ${JSON.stringify(tempSession)}`,
        lumberjackProperties);
    return tempSession;
}
