/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Redis from "ioredis";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Represents an interface for managing creation,
 * and authentication with a Redis client.
 */
export interface IRedisClientConnectionManager {
	/**
	 * Creates a new Redis client.
	 * @returns The newly created Redis client.
	 */
	authenticateAndCreateRedisClient(): Promise<void>;
	/**
	 * @returns The newly created Redis client.
	 */
	getRedisClient(): Redis.default;
}

export class RedisClientConnectionManager implements IRedisClientConnectionManager {
	private client: Redis.default | undefined;
	private readonly redisOptions: Redis.RedisOptions;

	constructor(redisOptions?: Redis.RedisOptions, redisConfig?: any) {
		if (!redisOptions && !redisConfig) {
			winston.info(
				"[DHRUV DEBUG] Historian Either redisOptions or redisConfig must be provided",
			);
			Lumberjack.info(
				"[DHRUV DEBUG] Historian Either redisOptions or redisConfig must be provided",
			);
			throw new Error("Either redisOptions or redisConfig must be provided");
		} else if (!redisOptions && redisConfig) {
			winston.info(
				"[DHRUV DEBUG] Historian using default redisOptions after reading from config",
			);
			Lumberjack.info(
				"[DHRUV DEBUG] Historian using default redisOptions after reading from config",
			);
			this.redisOptions = {
				host: redisConfig.host,
				port: redisConfig.port,
				password: redisConfig.pass,
				connectTimeout: redisConfig.connectTimeout,
				enableReadyCheck: true,
				maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
				enableOfflineQueue: redisConfig.enableOfflineQueue,
			};
			if (redisConfig.enableAutoPipelining) {
				/**
				 * When enabled, all commands issued during an event loop iteration are automatically wrapped in a
				 * pipeline and sent to the server at the same time. This can improve performance by 30-50%.
				 * More info: https://github.com/luin/ioredis#autopipelining
				 */
				this.redisOptions.enableAutoPipelining = true;
				this.redisOptions.autoPipeliningIgnoredCommands = ["ping"];
			}
			if (redisConfig.tls) {
				this.redisOptions.tls = {
					servername: redisConfig.host,
				};
			}
		} else if (redisOptions && !redisConfig) {
			winston.info("[DHRUV DEBUG] Historian using the provided redisOptions");
			Lumberjack.info("[DHRUV DEBUG] Historian using the provided redisOptions");
			this.redisOptions = redisOptions;
		} else {
			winston.error(
				"[DHRUV DEBUG] Historian Both redisOptions and redisConfig cannot be provided",
			);
			Lumberjack.error(
				"[DHRUV DEBUG] Historian Both redisOptions and redisConfig cannot be provided",
			);
			throw new Error("Both redisOptions and redisConfig cannot be provided");
		}
	}

	public async authenticateAndCreateRedisClient(): Promise<void> {
		winston.info("[DHRUV DEBUG] Historian Creating redis client");
		Lumberjack.info("[DHRUV DEBUG] Historian Creating redis client");
		this.client = new Redis.default(this.redisOptions);
		winston.info("[DHRUV DEBUG] Historian Redis client created");
		Lumberjack.info("[DHRUV DEBUG] Historian Redis client created");
	}

	public getRedisClient(): Redis.default {
		if (!this.client) {
			winston.error("[DHRUV DEBUG] Historian Redis client not initialized");
			Lumberjack.error("[DHRUV DEBUG] Historian Redis client not initialized");
			throw new Error("Redis client not initialized");
		}
		winston.info("[DHRUV DEBUG] Historian Returning latest redis client");
		Lumberjack.info("[DHRUV DEBUG] Historian Returning latest redis client");
		return this.client;
	}
}
