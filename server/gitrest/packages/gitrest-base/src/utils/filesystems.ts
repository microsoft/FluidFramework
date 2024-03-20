/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import { Volume } from "memfs";
import { Provider } from "nconf";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
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
	private readonly redisFsConfig: RedisFsConfig;

	constructor(
		config: Provider,
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
	) {
		this.redisFsConfig = {
			enableRedisFsMetrics: (config.get("git:enableRedisFsMetrics") as boolean) ?? true,
			redisApiMetricsSamplingPeriod:
				(config.get("git:redisApiMetricsSamplingPeriod") as number) ?? 0,
			enableOptimizedStat: (config.get("git:enableRedisFsOptimizedStat") as boolean) ?? false,
		};
		const redisConfig = config.get("redis");

		const enableHashmapRedisFs = (config.get("git:enableHashmapRedisFs") as boolean) ?? false;
		this.redisParams = {
			expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
			enableHashmapRedisFs,
			enableRedisMetrics: this.redisFsConfig.enableRedisFsMetrics,
			redisApiMetricsSamplingPeriod: this.redisFsConfig.redisApiMetricsSamplingPeriod,
		};
	}

	public create(fsManagerParams?: IFileSystemManagerParams): IFileSystemManager {
		return new RedisFsManager(
			this.redisParams,
			this.redisFsConfig,
			this.redisClientConnectionManager,
			fsManagerParams,
		);
	}
}
