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
		 * In a multi-service-instance environment, this should track state across all instances.
		 */
		private readonly clientManager: IClientManager,
		/**
		 * Session manager used to manage the set of active sessions.
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

	public startClientSession(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): void {
		this.startClientSessionCore(client, sessionId, knownConnectedClients).catch((error) => {
			Lumberjack.error(
				"Failed to start tracking client session",
				{
					...getLumberBaseProperties(sessionId.documentId, sessionId.tenantId),
					numConnectedClients: knownConnectedClients?.length,
				},
				error,
			);
		});
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
		// TODO: check session in session manager
		// If session exists, remove its lastClientLeaveTime property if necessary.
		// Otherwise, create a new session in the session manager.
	}
	public endClientSession(
		client: ICollaborationSessionClient,
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
		knownConnectedClients?: ISignalClient[],
	): void {
		this.endClientSessionCore(client, sessionId, knownConnectedClients).catch((error) => {
			Lumberjack.error(
				"Failed to end tracking client session",
				{
					...getLumberBaseProperties(sessionId.documentId, sessionId.tenantId),
					numConnectedClients: knownConnectedClients?.length,
				},
				error,
			);
		});
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
			const timer = setTimeout(
				() => this.handleClientSessionTimeout(existingSession),
				this.sessionActivityTimeoutMs,
			);
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

	private handleClientSessionTimeout(session: ICollaborationSession): void {
		const sessionDurationInMs = Date.now() - session.firstClientJoinTime;
		const metric = Lumberjack.newLumberMetric(LumberEventName.NexusSessionResult, {
			...getLumberBaseProperties(session.documentId, session.tenantId),
			// Explicitly set metric value as durationInMs because we can't use the automatic
			// start/end time calculation for this metric since we are logging immediately on create.
			metricValue: sessionDurationInMs,
			durationInMs: sessionDurationInMs,
			lastClientLeaveTimestamp: new Date(session.lastClientLeaveTime).toISOString(),
			...session.telemetryProperties,
		});

		// For now, always a "success" result
		metric.success("Session ended due to inactivity");
	}

	private getSessionTimerKey(
		sessionId: Pick<ICollaborationSession, "tenantId" | "documentId">,
	): string {
		return `${sessionId.tenantId}/${sessionId.documentId}`;
	}
}
