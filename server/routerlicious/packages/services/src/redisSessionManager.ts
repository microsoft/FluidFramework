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
 */
interface IShortCollaborationSession {
	/**
	 * {@link ICollaborationSession.documentId}
	 */
	did: string;
	/**
	 * {@link ICollaborationSession.tenantId}
	 */
	tid: string;
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

		return this.getFullSession(JSON.parse(sessionJson));
	}

	public async getAllSessions(): Promise<ICollaborationSession[]> {
		const sessionJsons = await this.redisClientConnectionManager
			.getRedisClient()
			.hgetall(this.prefix);
		const sessions: ICollaborationSession[] = [];
		for (const sessionJson of Object.values(sessionJsons)) {
			sessions.push(this.getFullSession(JSON.parse(sessionJson)));
		}
		return sessions;
	}

	private getShortSession(session: ICollaborationSession): IShortCollaborationSession {
		return {
			did: session.documentId,
			tid: session.tenantId,
			fjt: session.firstClientJoinTime,
			llt: session.lastClientLeaveTime,
			tp: {
				hwc: session.telemetryProperties.hadWriteClient,
				tlj: session.telemetryProperties.totalClientsJoined,
				mcc: session.telemetryProperties.maxConcurrentClients,
			},
		};
	}

	private getFullSession(shortSession: IShortCollaborationSession): ICollaborationSession {
		return {
			documentId: shortSession.did,
			tenantId: shortSession.tid,
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
}
