/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Volume } from "memfs";
import { Provider } from "nconf";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { closeRedisClientConnections } from "@fluidframework/server-services-shared";
import {
	IFileSystemManager,
	IFileSystemManagerFactory,
	IFileSystemManagerParams,
	type IFileSystemPromises,
} from "./definitions";
import { RedisParams, RedisFsManager, RedisFsConfig } from "./redisFs";
import { FsPromisesBase } from "./fileSystemBase";

class SimpleFsPromisesWrapper extends FsPromisesBase {
	constructor(
		private readonly innerFsPromises: IFileSystemPromises,
		maxFileSizeBytes?: number,
	) {
		super(maxFileSizeBytes);
	}
	protected async readFileCore(
		...args: Parameters<typeof fsPromises.readFile>
	): ReturnType<typeof fsPromises.readFile> {
		return this.innerFsPromises.readFile(...args);
	}
	protected async writeFileCore(
		...args: Parameters<typeof fsPromises.writeFile>
	): ReturnType<typeof fsPromises.writeFile> {
		return this.innerFsPromises.writeFile(...args);
	}
	protected async unlinkCore(
		...args: Parameters<typeof fsPromises.unlink>
	): ReturnType<typeof fsPromises.unlink> {
		return this.innerFsPromises.unlink(...args);
	}
	protected async readdirCore(
		...args: Parameters<typeof fsPromises.readdir>
	): ReturnType<typeof fsPromises.readdir> {
		return this.innerFsPromises.readdir(...args);
	}
	protected async mkdirCore(
		...args: Parameters<typeof fsPromises.mkdir>
	): ReturnType<typeof fsPromises.mkdir> {
		return this.innerFsPromises.mkdir(...args);
	}
	protected async rmdirCore(
		...args: Parameters<typeof fsPromises.rmdir>
	): ReturnType<typeof fsPromises.rmdir> {
		return this.innerFsPromises.rmdir(...args);
	}
	protected async statCore(
		...args: Parameters<typeof fsPromises.stat>
	): ReturnType<typeof fsPromises.stat> {
		return this.innerFsPromises.stat(...args);
	}
	protected async lstatCore(
		...args: Parameters<typeof fsPromises.lstat>
	): ReturnType<typeof fsPromises.lstat> {
		return this.innerFsPromises.lstat(...args);
	}
	protected async readlinkCore(
		...args: Parameters<typeof fsPromises.readlink>
	): ReturnType<typeof fsPromises.readlink> {
		return this.innerFsPromises.readlink(...args);
	}
	protected async symlinkCore(
		...args: Parameters<typeof fsPromises.symlink>
	): ReturnType<typeof fsPromises.symlink> {
		return this.innerFsPromises.symlink(...args);
	}
	protected async chmodCore(
		...args: Parameters<typeof fsPromises.chmod>
	): ReturnType<typeof fsPromises.chmod> {
		return this.innerFsPromises.chmod(...args);
	}
	protected async rmCore(
		...args: Parameters<typeof fsPromises.rm>
	): ReturnType<typeof fsPromises.rm> {
		return this.innerFsPromises.rm(...args);
	}
}

export class NodeFsManagerFactory implements IFileSystemManagerFactory {
	constructor(private readonly maxFileSizeBytes?: number) {}
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return { promises: new SimpleFsPromisesWrapper(fs.promises, this.maxFileSizeBytes) };
	}
}

export class MemFsManagerFactory implements IFileSystemManagerFactory {
	public readonly volume = new Volume();
	constructor(private readonly maxFileSizeBytes?: number) {}
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return {
			promises: new SimpleFsPromisesWrapper(
				this.volume.promises as unknown as IFileSystemPromises,
				this.maxFileSizeBytes,
			),
		};
	}
}

export class RedisFsManagerFactory implements IFileSystemManagerFactory {
	private readonly redisParams: RedisParams;
	private readonly redisFsConfig: RedisFsConfig;

	constructor(
		config: Provider,
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		private readonly maxFileSizeBytes?: number,
		private readonly documentTtlSec?: number,
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
			expireAfterSeconds:
				this.documentTtlSec ?? (redisConfig.keyExpireAfterSeconds as number | undefined),
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
			this.maxFileSizeBytes,
		);
	}

	public async dispose(): Promise<void> {
		await closeRedisClientConnections([this.redisClientConnectionManager]);
	}
}
