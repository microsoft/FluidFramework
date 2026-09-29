/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICache } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type {
	IRedisParameters,
	IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";

/**
 * Redis based cache redisClientConnectionManager.getRedisClient()
 * @internal
 */
export class RedisCache implements ICache {
	private readonly expireAfterSeconds: number | undefined;
	private readonly prefix: string = "page";
	constructor(
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		parameters?: IRedisParameters,
	) {
		this.expireAfterSeconds =
			parameters?.expireAfterSeconds === 0
				? undefined
				: parameters?.expireAfterSeconds ?? 60 * 60 * 24;

		if (parameters?.prefix !== undefined) {
			this.prefix = parameters.prefix;
		}

		redisClientConnectionManager.addErrorHandler(
			undefined, // lumber properties
			"Error with Redis", // error message
		);
	}
	public async delete(key: string): Promise<boolean> {
		try {
			await this.redisClientConnectionManager.getRedisClient().del(this.getKey(key));
			return true;
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(`Error deleting from cache.`, undefined, newError);
			return false;
		}
	}

	// eslint-disable-next-line @rushstack/no-new-null
	public async get(key: string): Promise<string | null> {
		try {
			// eslint-disable-next-line @typescript-eslint/return-await
			return this.redisClientConnectionManager.getRedisClient().get(this.getKey(key));
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error getting ${key.substring(0, 20)} from cache.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	public async set(key: string, value: string, expireAfterSeconds?: number): Promise<void> {
		try {
			const redisClient = this.redisClientConnectionManager.getRedisClient();
			if (key.startsWith("deletedDocument:")) {
				const marker = JSON.parse(value) as number;
				if (!Number.isFinite(marker)) {
					throw new Error("Document deletion marker is malformed.");
				}
				const result = (await redisClient.eval(
					`
local current = redis.call("GET", KEYS[1])
if current and tonumber(current) >= tonumber(ARGV[1]) then
	return 0
end
redis.call("SET", KEYS[1], ARGV[2])
return 1
`,
					1,
					this.getKey(key),
					marker,
					value,
				)) as number;
				if (result !== 0 && result !== 1) {
					throw new Error(`Unexpected Redis deletion marker result: ${result}`);
				}
				return;
			}
			const expiration = expireAfterSeconds ?? this.expireAfterSeconds;
			const result =
				expiration === undefined
					? await redisClient.set(this.getKey(key), value)
					: await redisClient.set(this.getKey(key), value, "EX", expiration);
			if (result !== "OK") {
				throw new Error(result);
			}
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error setting ${key.substring(0, 20)} in cache.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	public async incr(key: string): Promise<number> {
		try {
			// eslint-disable-next-line @typescript-eslint/return-await
			return this.redisClientConnectionManager.getRedisClient().incr(key);
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error while incrementing counter for ${key.substring(0, 20)} in redis.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	public async decr(key: string): Promise<number> {
		try {
			// eslint-disable-next-line @typescript-eslint/return-await
			return this.redisClientConnectionManager.getRedisClient().decr(key);
		} catch (error: any) {
			const newError: Error = { name: error?.name, message: error?.message };
			Lumberjack.error(
				`Error while decrementing counter for ${key.substring(0, 20)} in redis.`,
				undefined,
				newError,
			);
			throw newError;
		}
	}

	/**
	 * Translates the input key to the one we will actually store in redis
	 */
	private getKey(key: string): string {
		return `${this.prefix}:${key}`;
	}
}
