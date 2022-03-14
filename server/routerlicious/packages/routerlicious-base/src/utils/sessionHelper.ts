/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoManager, IDocument, IDocumentSession, ISession } from "@fluidframework/server-services-core";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

export async function getSession(globalDbMongoManager: MongoManager,
    documentId: string,
    ordererUrl: string,
    historianUrl: string,
    tenantId: string): Promise<IDocumentSession> {
    const lumberjackProperties = {
        [BaseTelemetryProperties.tenantId]: tenantId,
        [BaseTelemetryProperties.documentId]: documentId,
    };
    if (globalDbMongoManager === undefined) {
        const sessionP: ISession = {
            ordererUrl,
            historianUrl,
            isSessionAlive: null,
        };
        const documentSessionP: IDocumentSession = {
            documentId,
            hasSessionLocationChanged: false,
            session: sessionP,
        };
        Lumberjack.info(`Return the documentSessionP: ${JSON.stringify(documentSessionP)}`, lumberjackProperties);
        return documentSessionP;
    }

    const db = await globalDbMongoManager.getDatabase();
    const collection = db.collection("documents");
    const result = await collection.findOne({ documentId });
    const session = JSON.parse((result as IDocument).session) as ISession;
    const deli = JSON.parse((result as IDocument).deli);
    const isScribeEmpty = (result as IDocument).scribe === "";
    const scribe = isScribeEmpty ? "" : JSON.parse((result as IDocument).scribe);
    let hasSessionLocationChanged: boolean = false;
    const isSessionAlive: boolean = session.isSessionAlive;
    if (!session.isSessionAlive) {
        // Reset logOffset, ordererUrl, and historianUrl when switching cluster.
        if (session.ordererUrl !== ordererUrl) {
            const ms: string = `Reset logOffset, ordererUrl, and historianUrl when switching cluster.`;
            Lumberjack.info(ms, lumberjackProperties);
            deli.logOffset = -1;
            session.ordererUrl = ordererUrl;
            session.historianUrl = historianUrl;
            hasSessionLocationChanged = true;
            if (!isScribeEmpty) {
                scribe.logOffset = -1;
            }
        }
        session.isSessionAlive = true;
        (result as IDocument).deli = JSON.stringify(deli);
        (result as IDocument).scribe = isScribeEmpty ? "" : JSON.stringify(scribe);
        (result as IDocument).session = JSON.stringify(session);
        await collection.upsert({
            documentId,
        }, {
            deli: (result as IDocument).deli,
            scribe: (result as IDocument).scribe,
            session: (result as IDocument).session,
        }, {
        });
    }
    session.isSessionAlive = isSessionAlive;
    const documentSession: IDocumentSession = {
        documentId,
        hasSessionLocationChanged,
        session: JSON.parse((result as IDocument).session) as ISession,
    };
    Lumberjack.info(`Return the documentSession: ${JSON.stringify(documentSession)}`, lumberjackProperties);
    return documentSession;
}
