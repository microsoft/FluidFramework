/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import { Redis as IoRedis, RedisOptions as IoRedisOptions, type Cluster } from "ioredis";
import { Volume } from "memfs";
import { Provider } from "nconf";
import {
	IFileSystemManager,
	IFileSystemManagerFactory,
	IFileSystemManagerParams,
} from "./definitions";
import { RedisParams } from "./redisFs";
import { RedisFsManager, RedisFsConfig } from ".";

export class NodeFsManagerFactory implements IFileSystemManagerFactory {
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return fs;
	}
}

export class MemFsManagerFactory implements IFileSystemManagerFactory {
	public readonly volume = new Volume();
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return this.volume as unknown as IFileSystemManager;
	}
}

export class RedisFsManagerFactory implements IFileSystemManagerFactory {
	private readonly redisParams: RedisParams;
	private readonly redisOptions: IoRedisOptions;
	private readonly redisFsConfig: RedisFsConfig;
	private readonly enableClustering: boolean;

	constructor(
		config: Provider,
		private readonly createRedisClient?: (options: IoRedisOptions) => IoRedis | Cluster,
	) {
		this.redisFsConfig = {
			enableRedisFsMetrics: (config.get("git:enableRedisFsMetrics") as boolean) ?? true,
			redisApiMetricsSamplingPeriod:
				(config.get("git:redisApiMetricsSamplingPeriod") as number) ?? 0,
			enableOptimizedStat: (config.get("git:enableRedisFsOptimizedStat") as boolean) ?? false,
		};
		const redisConfig = config.get("redis");
		this.redisOptions = {
			host: redisConfig.host,
			port: redisConfig.port,
			password: redisConfig.pass,
			connectTimeout: redisConfig.connectTimeout,
			enableReadyCheck: true,
			maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
			enableOfflineQueue: redisConfig.enableOfflineQueue,
			retryStrategy: (attempts: number) => Math.min(attempts * 50, 2000),
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

		const enableHashmapRedisFs = (config.get("git:enableHashmapRedisFs") as boolean) ?? false;
		this.redisParams = {
			expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
			enableHashmapRedisFs,
			enableRedisMetrics: this.redisFsConfig.enableRedisFsMetrics,
			redisApiMetricsSamplingPeriod: this.redisFsConfig.redisApiMetricsSamplingPeriod,
		};

		this.enableClustering = redisConfig.enableClustering;
	}

	public create(fsManagerParams?: IFileSystemManagerParams): IFileSystemManager {
		return new RedisFsManager(
			this.redisParams,
			this.redisOptions,
			this.redisFsConfig,
			fsManagerParams,
			this.createRedisClient,
			this.enableClustering,
		);
	}
}
