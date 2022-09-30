/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISession, NetworkError } from "@fluidframework/server-services-client";
import { IDocument, ICollection } from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

const defaultSessionStickinessDurationMs = 60 * 60 * 1000; // 60 minutes

/**
 * Create a new session for a document that does not have a session defined,
 * and store document's new session in storage.
 */
async function createNewSession(
    ordererUrl: string,
    historianUrl: string,
    deltaStreamUrl: string,
    documentId,
    documentsCollection: ICollection<IDocument>,
    lumberjackProperties: Record<string, any>,
): Promise<ISession> {
    const newSession: ISession = {
        ordererUrl,
        historianUrl,
        deltaStreamUrl,
        isSessionAlive: true,
        isSessionActive: false,
    };
    try {
        await documentsCollection.upsert(
            {
                documentId,
            },
            {
                session: newSession,
            },
            null);
    } catch (error) {
        Lumberjack.error("Error persisting new document session to DB", lumberjackProperties, error);
        throw new NetworkError(500, "Failed to persist new document session");
    }
    Lumberjack.info(
        `The Session ${JSON.stringify(newSession)} was inserted into the document collection`,
        lumberjackProperties,
    );
    return newSession;
}

/**
 * Update an existing session for a document to be alive,
 * change the session location to this service's location if possible,
 * and store document's updated session in storage.
 */
async function updateExistingSession(
    ordererUrl: string,
    historianUrl: string,
    deltaStreamUrl: string,
    document: IDocument,
    existingSession: ISession,
    documentId,
    documentsCollection: ICollection<IDocument>,
    sessionStickinessDurationMs: number,
    lumberjackProperties: Record<string, any>,
): Promise<ISession> {
    let updatedDeli: string | undefined;
    let updatedScribe: string | undefined;
    let updatedOrdererUrl: string | undefined;
    let updatedHistorianUrl: string | undefined;
    let updatedDeltaStreamUrl: string | undefined;
    // Session stickiness keeps the a given document in 1 location for the configured
    // stickiness duration after the session ends. In the case of periodic op backup, this can ensure
    // that ops are backed up to a global location before a session is allowed to move.
    // Otherwise, a moved session could end up without access to ops that still only exist in a location's
    // non-global storage.
    const isSessionSticky = document.lastAccessTime !== undefined
        ? Date.now() - document.lastAccessTime < sessionStickinessDurationMs
        : false; // If no session end has been recorded, allow session to move.
    // Allow session stickiness to be overridden by manually deleting a session's orderer/historian urls.
    const sessionHasLocation: boolean =
        !!existingSession.ordererUrl && !!existingSession.historianUrl && !!existingSession.deltaStreamUrl;
    if (!isSessionSticky || !sessionHasLocation) {
        // Allow session location to be moved.
        if (
            existingSession.ordererUrl !== ordererUrl ||
            existingSession.historianUrl !== historianUrl ||
            existingSession.deltaStreamUrl !== deltaStreamUrl
        ) {
            // Previous session was in a different location. Move to current location.
            // Reset logOffset, ordererUrl, and historianUrl when moving session location.
            Lumberjack.info(
                `Reset logOffset, ordererUrl, and historianUrl when switching cluster.`,
                lumberjackProperties,
            );
            updatedOrdererUrl = ordererUrl;
            updatedHistorianUrl = historianUrl;
            updatedDeltaStreamUrl = deltaStreamUrl;
            if (document.deli !== "") {
                const deli = JSON.parse(document.deli);
                deli.logOffset = -1;
                updatedDeli = JSON.stringify(deli);
            }
            if (document.scribe !== "") {
                const scribe = JSON.parse(document.scribe);
                scribe.logOffset = -1;
                updatedScribe = JSON.stringify(scribe);
            }
        }
    }

    const updatedSession: ISession = {
        ordererUrl: updatedOrdererUrl ?? existingSession.ordererUrl,
        historianUrl: updatedHistorianUrl ?? existingSession.historianUrl,
        deltaStreamUrl: updatedDeltaStreamUrl ?? existingSession.deltaStreamUrl,
        // Update the status to isSessionAlive=true, since the session is now discovered.
        isSessionAlive: true,
        // If session was not alive, it cannot be "active"
        isSessionActive: false,
    };
    try {
        await documentsCollection.upsert(
            {
                documentId,
            },
            {
                deli: updatedDeli ?? document.deli,
                scribe: updatedScribe ?? document.scribe,
                session: updatedSession,
            },
            null);
    } catch (error) {
        Lumberjack.error("Error persisting update to existing document session", lumberjackProperties, error);
        throw new NetworkError(500, "Failed to persist update to document session");
    }
    return updatedSession;
}

/**
 * A discovered session's isSessionAlive property will be true regardless of session state before discovery.
 * A session is considered "fresh" when discovery flips the isSessionAlive property from false to true.
 * Discovery flips isSessionAlive from false to true when session is newly created, moved, or started.
 *
 * When a session is fresh, we send isSessionAlive=false to consumer to communicate session is fresh.
 */
function convertSessionToFreshSession(session: ISession, lumberjackProperties): ISession {
    const discoveredNewSession: ISession = {
        ...session,
        // Indicate to consumer that session was newly created.
        isSessionAlive: false,
    };
    Lumberjack.info(
        `Returning the session from the discovery: ${JSON.stringify(discoveredNewSession)}`,
        lumberjackProperties,
    );
    return discoveredNewSession;
}

/**
 * Return to the caller with the status of the session.
 */
export async function getSession(
    ordererUrl: string,
    historianUrl: string,
    deltaStreamUrl: string,
    tenantId: string,
    documentId: string,
    documentsCollection: ICollection<IDocument>,
    sessionStickinessDurationMs: number = defaultSessionStickinessDurationMs,
): Promise<ISession> {
    const lumberjackProperties = getLumberBaseProperties(documentId, tenantId);

    const document: IDocument = await documentsCollection.findOne({ tenantId, documentId });
    if (!document || document.scheduledDeletionTime !== undefined) {
        throw new NetworkError(404, "Document is deleted and cannot be accessed.");
    }
    // Session can be undefined for documents that existed before the concept of service sessions.
    const existingSession: ISession | undefined = document.session;

    if (!existingSession) {
        // Create a new session for the document and persist to DB.
        const newSession: ISession = await createNewSession(
            ordererUrl,
            historianUrl,
            deltaStreamUrl,
            documentId,
            documentsCollection,
            lumberjackProperties,
        );
        return convertSessionToFreshSession(newSession, lumberjackProperties);
    }

    if (existingSession.isSessionAlive) {
        // Existing session is considered alive/discovered, so return to consumer as-is.
        return existingSession;
    }

    // Session is not alive/discovered, so update and persist changes to DB.
    const updatedSession: ISession = await updateExistingSession(
        ordererUrl,
        historianUrl,
        deltaStreamUrl,
        document,
        existingSession,
        documentId,
        documentsCollection,
        sessionStickinessDurationMs,
        lumberjackProperties,
    );
    return convertSessionToFreshSession(updatedSession, lumberjackProperties);
}
