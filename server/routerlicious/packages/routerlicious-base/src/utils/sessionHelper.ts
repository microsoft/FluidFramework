/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISession, isNetworkError, NetworkError } from "@fluidframework/server-services-client";
import {
	IDocument,
	runWithRetry,
	IDocumentRepository,
	IClusterDrainingChecker,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { StageTrace } from "./trace";
import { delay } from "@fluidframework/common-utils";

const defaultSessionStickinessDurationMs = 60 * 60 * 1000; // 60 minutes

/**
 * Create a new session for a document that does not have a session defined,
 * and store document's new session in storage.
 */
async function createNewSession(
	ordererUrl: string,
	historianUrl: string,
	deltaStreamUrl: string,
	tenantId,
	documentId,
	documentRepository: IDocumentRepository,
	lumberjackProperties: Record<string, any>,
	messageBrokerId?: string,
): Promise<ISession> {
	const newSession: ISession = {
		ordererUrl,
		historianUrl,
		deltaStreamUrl,
		isSessionAlive: true,
		isSessionActive: false,
	};
	// if undefined and added directly to the session object - will be serialized as null in mongo which is undesirable
	if (messageBrokerId) {
		newSession.messageBrokerId = messageBrokerId;
	}
	try {
		await documentRepository.updateOne(
			{
				tenantId,
				documentId,
			},
			{
				session: newSession,
			},
			{
				upsert: true,
			},
		);
	} catch (error) {
		Lumberjack.error(
			"Error persisting new document session to DB",
			lumberjackProperties,
			error,
		);
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
	documentId: string,
	tenantId: string,
	documentRepository: IDocumentRepository,
	sessionStickinessDurationMs: number,
	lumberjackProperties: Record<string, any>,
	messageBrokerId?: string,
	ignoreSessionStickiness: boolean = false,
): Promise<ISession> {
	let updatedDeli: string | undefined;
	let updatedScribe: string | undefined;
	let updatedOrdererUrl: string | undefined;
	let updatedHistorianUrl: string | undefined;
	let updatedDeltaStreamUrl: string | undefined;
	let updatedMessageBrokerId: string | undefined = existingSession.messageBrokerId;
	// Session stickiness keeps the a given document in 1 location for the configured
	// stickiness duration after the session ends. In the case of periodic op backup, this can ensure
	// that ops are backed up to a global location before a session is allowed to move.
	// Otherwise, a moved session could end up without access to ops that still only exist in a location's
	// non-global storage.
	const sessionStickyCalculationTimestamp = Date.now();
	const isSessionSticky =
		document.lastAccessTime !== undefined
			? sessionStickyCalculationTimestamp - document.lastAccessTime <
			  sessionStickinessDurationMs
			: false; // If no session end has been recorded, allow session to move.
	// Allow session stickiness to be overridden by manually deleting a session's orderer/historian urls.
	const sessionHasLocation: boolean =
		!!existingSession.ordererUrl &&
		!!existingSession.historianUrl &&
		!!existingSession.deltaStreamUrl;
	Lumberjack.info("Calculated isSessionSticky, sessionHasLocation and ignoreSessionStickiness", {
		...lumberjackProperties,
		isSessionSticky,
		sessionHasLocation,
		documentLastAccessTime: document.lastAccessTime,
		sessionStickyCalculationTimestamp,
		sessionStickinessDurationMs,
		ignoreSessionStickiness,
	});
	if (!isSessionSticky || ignoreSessionStickiness || !sessionHasLocation) {
		// Allow session location to be moved.
		if (
			existingSession.ordererUrl !== ordererUrl ||
			existingSession.historianUrl !== historianUrl ||
			existingSession.deltaStreamUrl !== deltaStreamUrl ||
			existingSession.messageBrokerId !== messageBrokerId
		) {
			// Previous session was in a different location. Move to current location.
			// Reset logOffset, ordererUrl, and historianUrl when moving session location.
			Lumberjack.info("Moving session", {
				...lumberjackProperties,
				isSessionSticky,
				ignoreSessionStickiness,
				sessionHasLocation,
				oldSessionLocation: {
					ordererUrl: existingSession.ordererUrl,
					historianUrl: existingSession.historianUrl,
					deltaStreamUrl: existingSession.deltaStreamUrl,
					messageBrokerId: existingSession.messageBrokerId,
				},
				newSessionLocation: { ordererUrl, historianUrl, deltaStreamUrl, messageBrokerId },
			});
			updatedOrdererUrl = ordererUrl;
			updatedHistorianUrl = historianUrl;
			updatedDeltaStreamUrl = deltaStreamUrl;
			updatedMessageBrokerId = messageBrokerId;
			if (document.deli !== "") {
				const deli = JSON.parse(document.deli);
				deli.logOffset = -1;
				updatedDeli = JSON.stringify(deli);
				Lumberjack.info(`Reset deli logOffset as -1`, lumberjackProperties);
			}
			if (document.scribe !== "") {
				const scribe = JSON.parse(document.scribe);
				scribe.logOffset = -1;
				updatedScribe = JSON.stringify(scribe);
				Lumberjack.info(`Reset scribe logOffset as -1`, lumberjackProperties);
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
		// Always reset skip session stickiness to false when updating session
		// since the session should be moved to a different cluster in a clean state.
		ignoreSessionStickiness: false,
	};
	// if undefined and added directly to the session object - will be serialized as null in mongo which is undesirable
	if (updatedMessageBrokerId) {
		updatedSession.messageBrokerId = updatedMessageBrokerId;
	}
	try {
		const result = await documentRepository.findOneAndUpdate(
			{
				tenantId,
				documentId,
				"session.isSessionAlive": false,
			},
			{
				createTime: document.createTime,
				deli: updatedDeli ?? document.deli,
				documentId: document.documentId,
				session: updatedSession,
				scribe: updatedScribe ?? document.scribe,
				tenantId: document.tenantId,
				version: document.version,
			},
		);
		Lumberjack.info(
			`The original document session in updateExistingSession: ${JSON.stringify(
				result?.value?.session,
			)}`,
			lumberjackProperties,
		);
		// There is no document with isSessionAlive as false. It means this session has been discovered by
		// another call, and there is a race condition with different clients writing truth into the cosmosdb
		// from different clusters. Thus, let it get the truth from the cosmosdb with isSessionAlive as true.
		if (!result.existing) {
			Lumberjack.info(
				`The document with isSessionAlive as false does not exist`,
				lumberjackProperties,
			);
			const doc = await runWithRetry(
				async () =>
					documentRepository.readOne({
						tenantId,
						documentId,
						"session.isSessionAlive": true,
					}),
				"getDocumentWithAlive",
				3 /* maxRetries */,
				1000 /* retryAfterMs */,
				lumberjackProperties,
				undefined /* shouldIgnoreError */,
				(error) => true /* shouldRetry */,
			);
			if (!doc?.session) {
				Lumberjack.error(
					`Error running getSession from document: ${JSON.stringify(doc)}`,
					lumberjackProperties,
				);
				throw new NetworkError(500, "Error running getSession, please try again");
			}
			return doc.session;
		} else {
			Lumberjack.info(
				`The Session ${JSON.stringify(
					updatedSession,
				)} was updated into the documents collection`,
				lumberjackProperties,
			);
		}
	} catch (error) {
		Lumberjack.error(
			"Error persisting update to existing document session",
			lumberjackProperties,
			error,
		);
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
 * @internal
 */
export async function getSession(
	ordererUrl: string,
	historianUrl: string,
	deltaStreamUrl: string,
	tenantId: string,
	documentId: string,
	documentRepository: IDocumentRepository,
	sessionStickinessDurationMs: number = defaultSessionStickinessDurationMs,
	messageBrokerId?: string,
	clusterDrainingChecker?: IClusterDrainingChecker,
	ephemeralDocumentTTLSec?: number,
	connectionTrace?: StageTrace<string>,
	readDocumentRetryDelay: number = 150,
	readDocumentMaxRetries: number = 2,
): Promise<ISession> {
	const baseLumberjackProperties = getLumberBaseProperties(documentId, tenantId);

	let document: IDocument | null;
	try {
		document = await documentRepository.readOne({ tenantId, documentId });
		if (document === null) {
			await delay(readDocumentRetryDelay);
			document = await documentRepository.readOne({ tenantId, documentId });
		}
		if (document === null) {
			// Retry once in case of DB replication lag should be enough
			throw new NetworkError(404, "Document is deleted and cannot be accessed");
		}
	} catch (error: unknown) {
		connectionTrace?.stampStage(
			isNetworkError(error) && error.code === 404 ? "DocumentNotFound" : "DocumentDBError",
		);
		throw error;
	}

	// Check whether document was soft deleted
	if (document.scheduledDeletionTime !== undefined) {
		connectionTrace?.stampStage("DocumentSoftDeleted");
		throw new NetworkError(404, "Document is deleted and cannot be accessed.");
	}
	connectionTrace?.stampStage("DocumentExistenceChecked");

	const lumberjackProperties = {
		...baseLumberjackProperties,
		isEphemeralContainer: document.isEphemeralContainer,
	};
	if (document.isEphemeralContainer && ephemeralDocumentTTLSec !== undefined) {
		// Check if the document is ephemeral and has expired.
		const currentTime = Date.now();
		const documentExpirationTime = document.createTime + ephemeralDocumentTTLSec * 1000;
		if (currentTime > documentExpirationTime) {
			// If the document is ephemeral and older than the max ephemeral document TTL, throw an error indicating that it can't be accessed.
			const documentExpiredByMs = currentTime - documentExpirationTime;
			// TODO: switch back to "Ephemeral Container Expired" once clients update to use errorType, not error message. AB#12867
			const error = new NetworkError(404, "Document is deleted and cannot be accessed.");
			Lumberjack.warning(
				"Document is older than the max ephemeral document TTL.",
				{
					...lumberjackProperties,
					documentCreateTime: document.createTime,
					documentExpirationTime,
					documentExpiredByMs,
				},
				error,
			);
			connectionTrace?.stampStage("EphemeralDocumentExpired");
			throw error;
		}
	}
	connectionTrace?.stampStage("EphemeralExipiryChecked");

	// Session can be undefined for documents that existed before the concept of service sessions.
	const existingSession: ISession | undefined = document.session;
	Lumberjack.info(
		`The existingSession in getSession: ${JSON.stringify(existingSession)}`,
		lumberjackProperties,
	);

	if (!existingSession) {
		// Create a new session for the document and persist to DB.
		const newSession: ISession = await createNewSession(
			ordererUrl,
			historianUrl,
			deltaStreamUrl,
			tenantId,
			documentId,
			documentRepository,
			lumberjackProperties,
			messageBrokerId,
		);

		const freshSession: ISession = convertSessionToFreshSession(
			newSession,
			lumberjackProperties,
		);
		connectionTrace?.stampStage("NewSessionCreated");
		return freshSession;
	}
	connectionTrace?.stampStage("SessionExistenceChecked");

	if (existingSession.isSessionAlive || existingSession.isSessionActive) {
		// Existing session is considered alive/discovered or active, so return to consumer as-is.
		connectionTrace?.stampStage("SessionIsAlive");
		return existingSession;
	}
	connectionTrace?.stampStage("SessionLivenessChecked");

	// Session is not alive/discovered, so update and persist changes to DB.
	const ignoreSessionStickiness = existingSession.ignoreSessionStickiness ?? false;

	try {
		const updatedSession: ISession = await updateExistingSession(
			ordererUrl,
			historianUrl,
			deltaStreamUrl,
			document,
			existingSession,
			documentId,
			tenantId,
			documentRepository,
			sessionStickinessDurationMs,
			lumberjackProperties,
			messageBrokerId,
			ignoreSessionStickiness,
		);
		const freshSession: ISession = convertSessionToFreshSession(
			updatedSession,
			lumberjackProperties,
		);
		connectionTrace?.stampStage("UpdatedExistingSession");
		return freshSession;
	} catch (error) {
		connectionTrace?.stampStage("FailedToUpdateExistingSession");
		throw error;
	}
}
