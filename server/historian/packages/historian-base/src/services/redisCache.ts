/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";

import {
	type ActivateSummaryAccessResult,
	type ICache,
	type IEphemeralSummaryAccessRecord,
	type IEphemeralSummaryAccessStore,
	MalformedEphemeralSummaryAccessRecordError,
} from "./definitions";

/**
 * Redis based cache client
 */
export class RedisCache implements ICache, IEphemeralSummaryAccessStore {
	private readonly expireAfterSeconds: number = 60 * 60 * 24;
	private readonly prefix: string = "git";

	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		parameters?: IRedisParameters,
	) {
		if (parameters?.expireAfterSeconds) {
			this.expireAfterSeconds = parameters.expireAfterSeconds;
		}

		if (parameters?.prefix) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.addErrorHandler(undefined, "Redis Cache Error");
	}

	public async get<T>(key: string): Promise<T | null> {
		const stringValue = await this.redisClientConnectionManager
			.getRedisClient()
			.get(this.getKey(key));
		if (stringValue === null) {
			return null;
		}
		return JSON.parse(stringValue) as T;
	}

	public async set<T>(
		key: string,
		value: T,
		expireAfterSeconds: number = this.expireAfterSeconds,
	): Promise<void> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.set(this.getKey(key), JSON.stringify(value), "EX", expireAfterSeconds);
		if (result !== "OK") {
			throw new Error(result);
		}
	}

	public async delete(key: string): Promise<boolean> {
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.del(this.getKey(key));
		// The DEL API in Redis returns the number of keys that were removed.
		// We always call Redis DEL with one key only, so we expect a result equal to 1
		// to indicate that the key was removed. 0 would indicate that the key does not exist.
		return result === 1;
	}

	public async readSummaryAccess(
		tenantId: string,
		documentId: string,
	): Promise<IEphemeralSummaryAccessRecord | undefined> {
		const value = await this.redisClientConnectionManager
			.getRedisClient()
			.get(this.getSummaryAccessKey(tenantId, documentId));
		return value === null ? undefined : this.parseSummaryAccessRecord(value);
	}

	public async activateSummaryAccessIfNotDeleted(
		tenantId: string,
		documentId: string,
		createTime: number,
		expiresAt: number,
	): Promise<ActivateSummaryAccessResult> {
		this.validateSummaryAccessWrite(createTime, expiresAt);
		const redis = this.redisClientConnectionManager.getRedisClient();
		const result = await redis.eval(
			`
local current = redis.call("GET", KEYS[1])
if current then
    if string.match(current, "^D:%d+$") then
        return 0
    end
    if string.match(current, "^A:%d+$") then
        return 1
    end
    return -1
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
return 2
`,
			1,
			this.getSummaryAccessKey(tenantId, documentId),
			`A:${createTime}`,
			this.getExpirySeconds(expiresAt),
		);

		switch (result) {
			case -1:
				throw new MalformedEphemeralSummaryAccessRecordError(
					"Malformed ephemeral summary access record.",
				);
			case 0:
				return "deleted";
			case 1:
				return "alreadyActive";
			case 2:
				return "created";
			default:
				throw new Error(`Unexpected ephemeral summary access activation result: ${result}`);
		}
	}

	public async markSummaryAccessDeleted(
		tenantId: string,
		documentId: string,
		createTime: number,
		expiresAt: number,
	): Promise<void> {
		this.validateSummaryAccessWrite(createTime, expiresAt);
		const result = await this.redisClientConnectionManager
			.getRedisClient()
			.set(
				this.getSummaryAccessKey(tenantId, documentId),
				`D:${createTime}`,
				"EX",
				this.getExpirySeconds(expiresAt),
			);
		if (result !== "OK") {
			throw new Error(`Failed to mark ephemeral summary access deleted: ${result}`);
		}
	}

	private validateSummaryAccessWrite(createTime: number, expiresAt: number): void {
		if (!Number.isSafeInteger(createTime) || createTime < 0) {
			throw new Error("Ephemeral summary access createTime must be a finite timestamp.");
		}
		if (!Number.isFinite(expiresAt)) {
			throw new Error("Ephemeral summary access expiration must be finite.");
		}
	}

	private getSummaryAccessKey(tenantId: string, documentId: string): string {
		return this.getKey(
			`summaryAccess:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(documentId)}`,
		);
	}

	private parseSummaryAccessRecord(value: string): IEphemeralSummaryAccessRecord {
		const match = /^(A|D):(\d+)$/.exec(value);
		if (match === null) {
			throw new MalformedEphemeralSummaryAccessRecordError(
				"Malformed ephemeral summary access record.",
			);
		}

		const createTime = Number(match[2]);
		if (!Number.isSafeInteger(createTime)) {
			throw new MalformedEphemeralSummaryAccessRecordError(
				"Malformed ephemeral summary access record.",
			);
		}

		return {
			version: 1,
			state: match[1] === "A" ? "active" : "deleted",
			createTime,
		};
	}

	private getExpirySeconds(expiresAt: number): number {
		return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}
