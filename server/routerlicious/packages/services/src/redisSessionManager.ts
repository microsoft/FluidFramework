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
 * Options for {@link RedisCollaborationSessionManager} that tune specific behaviors.
 * @internal
 */
export interface IRedisCollaborationSessionManagerOptions {
	/**
	 * Maximum number of sessions to scan at once when calling {@link RedisCollaborationSessionManager.getAllSessions}.
	 * The expected return size of a given session is less than 200 bytes, including the key.
	 * @defaultValue 800 - Intended to keep each scan result under 200KB (which would be ~1000 sessions).
	 */
	maxScanBatchSize: number;
}

const defaultRedisCollaborationSessionManagerOptions: IRedisCollaborationSessionManagerOptions = {
	maxScanBatchSize: 800,
};

/**
 * Manages the set of collaboration sessions in a Redis hashmap.
 * @internal
 */
export class RedisCollaborationSessionManager implements ICollaborationSessionManager {
	/**
	 * Redis hashmap key.
	 */
	private readonly prefix: string = "collaboration-session";
	private readonly options: IRedisCollaborationSessionManagerOptions;

	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		parameters?: IRedisParameters,
		options?: Partial<IRedisCollaborationSessionManagerOptions>,
	) {
		this.options = { ...defaultRedisCollaborationSessionManagerOptions, ...options };
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
		// Use HSCAN to iterate over te key:value pairs of the hashmap
		// in batches to get all sessions with minimal impact on Redis.
		const sessionJsonScanStream = this.redisClientConnectionManager
			.getRedisClient()
			.hscanStream(this.prefix, { count: this.options.maxScanBatchSize });
		return new Promise((resolve, reject) => {
			const sessions: ICollaborationSession[] = [];
			sessionJsonScanStream.on("data", (result: string[]) => {
				if (!result) {
					// When redis scan is done, it pushes null to the stream.
					// This should only trigger the "end" event, but we should check for it to be safe.
					return;
				}
				if (!Array.isArray(result) || result.length % 2 !== 0) {
					throw new Error("Invalid scan result");
				}
				// The scan stream emits an array of alternating field keys and values.
				// For example, a hashmap like { key1: value1, key2: value2 } would emit ["key1", "value1", "key2", "value2"].
				for (let i = 0; i < result.length; i += 2) {
					const fieldKey = result[i];
					const sessionJson = result[i + 1];
					sessions.push(this.getFullSession(fieldKey, JSON.parse(sessionJson)));
				}
			});
			sessionJsonScanStream.on("end", () => {
				resolve(sessions);
			});
			sessionJsonScanStream.on("error", (error) => {
				reject(error);
			});
		});
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
