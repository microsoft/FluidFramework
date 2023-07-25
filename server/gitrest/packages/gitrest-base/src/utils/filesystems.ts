/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import * as Redis from "ioredis";
import { Volume } from "memfs";
import { Provider } from "nconf";
import { IRedisParameters } from "@fluidframework/server-services-utils";
import {
	IFileSystemManager,
	IFileSystemManagerFactory,
	IFileSystemManagerParams,
} from "./definitions";
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
	private readonly redisParams: IRedisParameters;
	private readonly redisOptions: Redis.RedisOptions;
	private readonly redisFsConfig: RedisFsConfig;
	constructor(config: Provider) {
		this.redisFsConfig = {
			enableRedisFsMetrics: (config.get("git:enableRedisFsMetrics") as boolean) ?? true,
			redisApiMetricsSamplingPeriod:
				(config.get("git:redisApiMetricsSamplingPeriod") as number) ?? 0,
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

		this.redisParams = {
			prefix: "git",
			expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
		};
	}

	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return new RedisFsManager(this.redisParams, this.redisOptions, this.redisFsConfig);
	}
}
