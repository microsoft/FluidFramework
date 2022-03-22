/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { ISession, IDocumentSession } from "@fluidframework/server-services-client";
// import { MongoManager, IDocument, ICollection } from "@fluidframework/server-services-core";
// import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

import { IDocumentSession, ISession } from "@fluidframework/server-services-client";
import { IDocument, ICollection } from "@fluidframework/server-services-core";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

export async function getSession(documentId: string,
    ordererUrl: string,
    historianUrl: string,
    tenantId: string,
    documentsCollection: ICollection<IDocument>): Promise<IDocumentSession> {
    const lumberjackProperties = {
        [BaseTelemetryProperties.tenantId]: tenantId,
        [BaseTelemetryProperties.documentId]: documentId,
    };
    // if (globalDbMongoManager === undefined) {
    //     const sessionP: ISession = {
    //         ordererUrl,
    //         historianUrl,
    //         isSessionAlive: null,
    //     };
    //     const documentSessionP: IDocumentSession = {
    //         documentId,
    //         hasSessionLocationChanged: false,
    //         session: sessionP,
    //     };
    //     Lumberjack.info(`Return the documentSessionP: ${JSON.stringify(documentSessionP)}`, lumberjackProperties);
    //     return documentSessionP;
    // }

    const tempDocument: IDocument = await documentsCollection.findOne({ documentId });
    const tempSession: ISession = tempDocument.session;
    const deli = JSON.parse(tempDocument.deli);
    const isScribeEmpty = tempDocument.scribe === "";
    const scribe = isScribeEmpty ? "" : JSON.parse(tempDocument.scribe);
    let hasSessionLocationChanged: boolean = false;
    const isSessionAlive: boolean = tempSession.isSessionAlive;
    if (!tempSession.isSessionAlive) {
        // Reset logOffset, ordererUrl, and historianUrl when switching cluster.
        if (tempSession.ordererUrl !== ordererUrl) {
            const ms: string = `Reset logOffset, ordererUrl, and historianUrl when switching cluster.`;
            Lumberjack.info(ms, lumberjackProperties);
            deli.logOffset = -1;
            tempSession.ordererUrl = ordererUrl;
            tempSession.historianUrl = historianUrl;
            hasSessionLocationChanged = true;
            if (!isScribeEmpty) {
                scribe.logOffset = -1;
            }
        }
        tempSession.isSessionAlive = true;
        await documentsCollection.upsert({
            documentId,
        }, {
            deli: JSON.stringify(deli),
            scribe: isScribeEmpty ? "" : JSON.stringify(scribe),
            session: tempSession,
        }, {
        });
    }
    tempSession.isSessionAlive = isSessionAlive;
    const documentSession: IDocumentSession = {
        documentId,
        hasSessionLocationChanged,
        session: tempSession,
    };
    Lumberjack.info(`Return the documentSession: ${JSON.stringify(documentSession)}`, lumberjackProperties);
    return documentSession;
}
