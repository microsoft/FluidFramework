/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISignalClient } from "@fluidframework/protocol-definitions";
import {
	ICollaborationSessionClient,
	ICollaborationSession,
	ICollaborationSessionManager,
	ICollaborationSessionTracker,
	IClientManager,
} from "@fluidframework/server-services-core";
import {
	getLumberBaseProperties,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";

/**
 * Tracks the state of collaboration sessions and manages their lifecycle.
 * @internal
 */
export class CollaborationSessionTracker implements ICollaborationSessionTracker {
	/**
	 * Map of session timers keyed by session ID.
	 *
	 * @remarks
	 * When a session is "ended" (last connected client session ends), a timer is started to
	 * end the document's collaboration session after a period of inactivity.
	 * This map tracks those timers so they can be cleared if a client reconnects.
	 * Additionally, when the timer expires, the cross-instance client manager is checked to verify
	 * that no clients have reconnected to the session, in which case the timer on this instance is ignored.
	 */
	private readonly sessionEndTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(
		/**
		 * Client manager used to manage the set of connected clients.
		 *
		 * @remarks
		 * In a multi-service-instance environment, this should track state across all instances.
		 */
		private readonly clientManager: IClientManager,
		/**
		 * Session manager used to manage the set of active sessions.
		 *
		 * @remarks
		 * In a multi-service-instance environment, this should track state across all instances.
		 * This is also used to periodically prune sessions whose timers have expired but were not
		 * cleaned up due to a service shutdown or other error.
		 */
		private readonly sessionManager: ICollaborationSessionManager,
		/**
		 * Timeout in milliseconds after which a session is considered inactive and can be ended.
		 * After a the last client in a document's session disconnects, this countdown begins.
		 * Default: 10 minutes
		 */
		private readonly sessionActivityTimeoutMs = 10 * 60 * 1000,
	) {}

	public async startClientSession(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<void> {
		return this.startClientSessionCore(client, sessionId, knownConnectedClients).catch(
			(error) => {
				Lumberjack.error(
					"Failed to start tracking client session",
					{
						...getLumberBaseProperties(sessionId.documentId, sessionId.tenantId),
						numConnectedClients: knownConnectedClients?.length,
					},
					error,
				);
				throw error;
			},
		);
	}

	private async startClientSessionCore(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<void> {
		// Clear the session end timer if it exists
		const sessionTimerKey = this.getSessionTimerKey(sessionId);
		clearTimeout(this.sessionEndTimers.get(sessionTimerKey));

		// Update the session in the session manager
		const { existingSession, otherConnectedClients } = await this.getSessionAndClients(
			client,
			sessionId,
			knownConnectedClients,
		);
		const totalCurrentClients: number = otherConnectedClients.length + 1;
		const updatedSession: ICollaborationSession = {
			tenantId: existingSession?.tenantId ?? sessionId.tenantId,
			documentId: existingSession?.documentId ?? sessionId.documentId,
			firstClientJoinTime: existingSession?.firstClientJoinTime ?? client.joinedTime,
			lastClientLeaveTime: undefined,
			telemetryProperties: {
				hadWriteClient:
					existingSession?.telemetryProperties?.hadWriteClient || client.isWriteClient,
				totalClientsJoined:
					(existingSession?.telemetryProperties?.totalClientsJoined ?? 0) +
					totalCurrentClients,
				maxConcurrentClients: Math.max(
					existingSession?.telemetryProperties?.maxConcurrentClients ?? 0,
					totalCurrentClients,
				),
			},
		};
		// Create a new session in the session manager
		await this.sessionManager.addOrUpdateSession({
			...updatedSession,
		});
	}

	public async endClientSession(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<void> {
		return this.endClientSessionCore(client, sessionId, knownConnectedClients).catch(
			(error) => {
				Lumberjack.error(
					"Failed to end tracking client session",
					{
						...getLumberBaseProperties(sessionId.documentId, sessionId.tenantId),
						numConnectedClients: knownConnectedClients?.length,
					},
					error,
				);
				throw error;
			},
		);
	}

	private async endClientSessionCore(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<void> {
		const sessionTimerKey = this.getSessionTimerKey(sessionId);
		const { existingSession, otherConnectedClients } = await this.getSessionAndClients(
			client,
			sessionId,
			knownConnectedClients,
		);
		if (!existingSession) {
			throw new Error("Existing session not found in endClientSessionCore");
		}

		// Clear the session end timer if it exists. This shouldn't be necessary if the timer is
		// properly cleared when the last client reconnects, but this is a safety measure.
		clearTimeout(this.sessionEndTimers.get(sessionTimerKey));
		if (otherConnectedClients.length === 0) {
			// Start a timer to end the session after a period of inactivity
			const timer = setTimeout(() => {
				this.handleClientSessionTimeout(existingSession).catch((error) => {
					Lumberjack.error(
						"Failed to cleanup session on timeout",
						{
							...getLumberBaseProperties(
								existingSession.documentId,
								existingSession.tenantId,
							),
							...existingSession.telemetryProperties,
						},
						error,
					);
				});
			}, this.sessionActivityTimeoutMs);
			this.sessionEndTimers.set(sessionTimerKey, timer);
			// Update the session to have a lastClientLeaveTime
			await this.sessionManager.addOrUpdateSession({
				...existingSession,
				lastClientLeaveTime: Date.now(),
			});
		} else {
			// Make sure the session manager shows lastClientLeaveTime as undefined
			await this.sessionManager.addOrUpdateSession({
				...existingSession,
				lastClientLeaveTime: undefined,
			});
		}
	}

	public async pruneInactiveSessions(): Promise<void> {
		return this.pruneInactiveSessionsCore().catch((error) => {
			Lumberjack.error("Failed to prune inactive sessions", undefined, error);
			throw error;
		});
	}

	private async pruneInactiveSessionsCore(): Promise<void> {
		const allSessions = await this.sessionManager.getAllSessions();
		const now = Date.now();
		// Add a buffer to the session activity timeout to prevent pruning sessions that are already
		// being closed or have just been closed normally.
		const inactiveSessionPruningBuffer = Math.round(1.1 * this.sessionActivityTimeoutMs);
		const inactiveSessionsToPrune = allSessions.filter(
			(session) =>
				// Check if the session has ended due to inactivity
				session.lastClientLeaveTime !== undefined &&
				// Check if the session has been inactive for longer than the timeout + buffer
				now - session.lastClientLeaveTime >
					this.sessionActivityTimeoutMs + inactiveSessionPruningBuffer,
		);
		const clientSessionTimeoutPs: Promise<void>[] = inactiveSessionsToPrune.map(
			async (session) =>
				// Depending on how frequently pruning occurs, this could cause the session's
				// telemetry to indicate the session's duration was longer than it actually was.
				// However, we can ignore that because it is technically correct that the session
				// was tracked as "active" for that duration. We log lastClientLeaveTime in the
				// telemetry so that the actual end time is known.
				this.handleClientSessionTimeout(session, "pruning").catch((error) => {
					Lumberjack.error(
						"Failed to cleanup session on timeout detected by pruning",
						{
							...getLumberBaseProperties(session.documentId, session.tenantId),
							...session.telemetryProperties,
						},
						error,
					);
				}),
		);
		await Promise.all(clientSessionTimeoutPs);
	}

	private async getSessionAndClients(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): Promise<{
		existingSession: ICollaborationSession | undefined;
		otherConnectedClients: ISignalClient[];
	}> {
		const existingSession = await this.sessionManager.getSession(sessionId);
		const otherConnectedClients = [
			...(knownConnectedClients ??
				(await this.clientManager.getClients(sessionId.tenantId, sessionId.documentId))),
		].filter((c) => c.clientId !== client.clientId); // Remove the client that is prompting the action
		return { existingSession, otherConnectedClients };
	}

	private async handleClientSessionTimeout(
		session: ICollaborationSession,
		reason = "inactivity",
	): Promise<void> {
		const now = Date.now();
		const sessionDurationInMs = now - session.firstClientJoinTime;
		const metric = Lumberjack.newLumberMetric(LumberEventName.NexusSessionResult, {
			...getLumberBaseProperties(session.documentId, session.tenantId),
			// Explicitly set metric value as durationInMs because we can't use the automatic
			// start/end time calculation for this metric since we are logging immediately on create.
			metricValue: sessionDurationInMs,
			durationInMs: sessionDurationInMs,
			lastClientLeaveTimestamp:
				session.lastClientLeaveTime !== undefined
					? new Date(session.lastClientLeaveTime).toISOString()
					: undefined,
			timeSinceLastClientLeaveMs:
				session.lastClientLeaveTime !== undefined
					? now - session.lastClientLeaveTime
					: undefined,
			...session.telemetryProperties,
		});

		// For now, always a "success" result
		metric.success(`Session ended due to ${reason}`);
		return this.cleanupSessionOnEnd(session);
	}

	private async cleanupSessionOnEnd(session: ICollaborationSession): Promise<void> {
		// Clear the session end timer if it exists
		const sessionTimerKey = this.getSessionTimerKey(session);
		clearTimeout(this.sessionEndTimers.get(sessionTimerKey));
		this.sessionEndTimers.delete(sessionTimerKey);

		// Remove the session from the session manager
		await this.sessionManager.removeSession({
			tenantId: session.tenantId,
			documentId: session.documentId,
		});
	}

	private getSessionTimerKey(
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
	): string {
		return `${sessionId.tenantId}/${sessionId.documentId}`;
	}
}
