/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Redis from "ioredis";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { getRedisClusterRetryStrategy } from "./redisUtils";

/**
 * Represents an interface for managing creation,
 * and authentication with a Redis client.
 */
export interface IRedisClientConnectionManager {
	/**
	 * @returns The Redis client.
	 */
	getRedisClient(): Redis.default | Redis.Cluster;
}

export class RedisClientConnectionManager implements IRedisClientConnectionManager {
	private client: Redis.default | Redis.Cluster | undefined;
	private readonly redisOptions: Redis.RedisOptions;
	private readonly enableClustering: boolean;
	private readonly slotsRefreshTimeout: number;
	private readonly retryDelays: {
		retryDelayOnFailover: number;
		retryDelayOnClusterDown: number;
		retryDelayOnTryAgain: number;
		retryDelayOnMoved: number;
		maxRedirections?: number;
	};

	constructor(
		redisOptions?: Redis.RedisOptions,
		redisConfig?: any,
		enableClustering: boolean = false,
		slotsRefreshTimeout: number = 50000,
		retryDelays: {
			retryDelayOnFailover: number;
			retryDelayOnClusterDown: number;
			retryDelayOnTryAgain: number;
			retryDelayOnMoved: number;
			maxRedirections?: number;
		} = {
			retryDelayOnFailover: 100,
			retryDelayOnClusterDown: 100,
			retryDelayOnTryAgain: 100,
			retryDelayOnMoved: 100,
			maxRedirections: 16,
		},
	) {
		this.enableClustering = enableClustering;
		this.slotsRefreshTimeout = slotsRefreshTimeout;
		this.retryDelays = retryDelays;
		if (!redisOptions && !redisConfig) {
			Lumberjack.error("Either redisOptions or redisConfig must be provided");
			throw new Error("Either redisOptions or redisConfig must be provided");
		} else if (!redisOptions && redisConfig) {
			Lumberjack.info("Using default redisOptions after reading from config");
			this.redisOptions = {
				host: redisConfig.host,
				port: redisConfig.port,
				password: redisConfig.pass,
				connectTimeout: redisConfig.connectTimeout,
				enableReadyCheck: true,
				maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
				enableOfflineQueue: redisConfig.enableOfflineQueue,
				retryStrategy: getRedisClusterRetryStrategy({
					delayPerAttemptMs: 50,
					maxDelayMs: 2000,
				}),
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
		} else {
			Lumberjack.info("Using the provided redisOptions");
			// Adding this check here to avoid linting errors
			// If control-flow lands here, redisOptions will be defined
			if (!redisOptions) {
				Lumberjack.error("redisOptions must be provided");
				throw new Error("redisOptions must be provided");
			}
			this.redisOptions = redisOptions;
		}
		this.authenticateAndCreateRedisClient();
	}

	private authenticateAndCreateRedisClient(): void {
		this.client = this.enableClustering
			? new Redis.Cluster([{ port: this.redisOptions.port, host: this.redisOptions.host }], {
					redisOptions: this.redisOptions,
					slotsRefreshTimeout: this.slotsRefreshTimeout,
					dnsLookup: (adr, callback) => callback(null, adr),
					showFriendlyErrorStack: true,
					retryDelayOnFailover: this.retryDelays.retryDelayOnFailover,
					retryDelayOnClusterDown: this.retryDelays.retryDelayOnClusterDown,
					retryDelayOnTryAgain: this.retryDelays.retryDelayOnTryAgain,
					retryDelayOnMoved: this.retryDelays.retryDelayOnMoved,
					maxRedirections: this.retryDelays.maxRedirections,
			  })
			: new Redis.default(this.redisOptions);
		Lumberjack.info("Redis client created");
	}

	public getRedisClient(): Redis.default | Redis.Cluster {
		if (!this.client) {
			throw new Error("Redis client not initialized");
		}
		return this.client;
	}
}
