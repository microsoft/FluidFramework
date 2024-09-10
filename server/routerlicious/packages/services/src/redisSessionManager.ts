/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICollaborationSession,
	ICollaborationSessionManager,
} from "@fluidframework/server-services-core";
import {
	IRedisClientConnectionManager,
	IRedisParameters,
} from "@fluidframework/server-services-utils";

/**
 * {@link ICollaborationSession} with shortened key names for storage in Redis.
 *
 * @remarks
 * Does not include {@link ICollaborationSession.documentId} and {@link ICollaborationSession.tenantId} because
 * they are used as the Redis hashmap key.
 */
interface IShortCollaborationSession {
	/**
	 * {@link ICollaborationSession.firstClientJoinTime}
	 */
	fjt: number;
	/**
	 * {@link ICollaborationSession.lastClientLeaveTime}
	 */
	llt: number | undefined;
	/**
	 * {@link ICollaborationSession.telemetryProperties}
	 */
	tp: {
		/**
		 * {@link ICollaborationSessionTelemetryProperties.hadWriteClient}
		 */
		hwc: boolean;
		/**
		 * {@link ICollaborationSessionTelemetryProperties.totalClientsJoined}
		 */
		tlj: number;
		/**
		 * {@link ICollaborationSessionTelemetryProperties.maxConcurrentClients}
		 */
		mcc: number;
	};
}

/**
 * Manages the set of collaboration sessions in a Redis hashmap.
 * @internal
 */
export class RedisCollaborationSessionManager implements ICollaborationSessionManager {
	/**
	 * Redis hashmap key.
	 */
	private readonly prefix: string = "collaboration-session";

	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		parameters?: IRedisParameters,
	) {
		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.addErrorHandler(
			undefined, // lumber properties
			"Collaboration Session Manager Redis Error", // error message
		);
	}

	public async addOrUpdateSession(session: ICollaborationSession): Promise<void> {
		const key = this.getFieldKey(session);
		await this.redisClientConnectionManager
			.getRedisClient()
			.hset(this.prefix, key, JSON.stringify(this.getShortSession(session)));
	}

	public async removeSession(
		session: Pick<ICollaborationSession, "tenantId" | "documentId">,
	): Promise<void> {
		const key = this.getFieldKey(session);
		await this.redisClientConnectionManager.getRedisClient().hdel(this.prefix, key);
	}

	public async getSession(
		session: Pick<ICollaborationSession, "tenantId" | "documentId">,
	): Promise<ICollaborationSession | undefined> {
		const key = this.getFieldKey(session);
		const sessionJson = await this.redisClientConnectionManager
			.getRedisClient()
			.hget(this.prefix, key);
		if (sessionJson === null) {
			return undefined;
		}

		return this.getFullSession(key, JSON.parse(sessionJson));
	}

	public async getAllSessions(): Promise<ICollaborationSession[]> {
		const sessionJsons = await this.redisClientConnectionManager
			.getRedisClient()
			.hgetall(this.prefix);
		const sessions: ICollaborationSession[] = [];
		for (const [fieldKey, sessionJson] of Object.entries(sessionJsons)) {
			sessions.push(this.getFullSession(fieldKey, JSON.parse(sessionJson)));
		}
		return sessions;
	}

	private getShortSession(session: ICollaborationSession): IShortCollaborationSession {
		return {
			fjt: session.firstClientJoinTime,
			llt: session.lastClientLeaveTime,
			tp: {
				hwc: session.telemetryProperties.hadWriteClient,
				tlj: session.telemetryProperties.totalClientsJoined,
				mcc: session.telemetryProperties.maxConcurrentClients,
			},
		};
	}

	private getFullSession(
		fieldKey: string,
		shortSession: IShortCollaborationSession,
	): ICollaborationSession {
		return {
			...this.getTenantIdDocumentIdFromFieldKey(fieldKey),
			firstClientJoinTime: shortSession.fjt,
			lastClientLeaveTime: shortSession.llt,
			telemetryProperties: {
				hadWriteClient: shortSession.tp.hwc,
				totalClientsJoined: shortSession.tp.tlj,
				maxConcurrentClients: shortSession.tp.mcc,
			},
		};
	}

	private getFieldKey(session: Pick<ICollaborationSession, "tenantId" | "documentId">): string {
		return `${session.tenantId}:${session.documentId}`;
	}

	private getTenantIdDocumentIdFromFieldKey(fieldKey: string): {
		tenantId: string;
		documentId: string;
	} {
		const [tenantId, documentId] = fieldKey.split(":");
		return { tenantId, documentId };
	}
}
