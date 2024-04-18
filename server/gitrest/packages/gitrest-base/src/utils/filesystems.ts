/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs, { type Mode, type ObjectEncodingOptions, type OpenMode, type PathLike } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import type { Stream } from "node:stream";
import type { Abortable } from "node:events";
import { Volume } from "memfs";
import { Provider } from "nconf";
import sizeof from "object-sizeof";
import { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import {
	IFileSystemManager,
	IFileSystemManagerFactory,
	IFileSystemManagerParams,
	type IFileSystemPromises,
} from "./definitions";
import { RedisParams, RedisFsManager, RedisFsConfig } from "./redisFs";
import { FilesystemError, SystemErrors } from "./fileSystemHelper";

class FsManagerWrapper implements IFileSystemManager {
	public readonly promises: IFileSystemPromises;
	constructor(
		private readonly fsManager: IFileSystemManager,
		private readonly maxFileSizeBytes?: number,
	) {
		this.promises = {
			...fsManager.promises,
			writeFile: this.writeFile.bind(this),
		};
	}

	/**
	 * Asynchronously writes data to a file, replacing the file if it already exists.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L101
	 */
	private async writeFile(
		filepath: PathLike | FileHandle,
		data:
			| string
			| NodeJS.ArrayBufferView
			| Iterable<string | NodeJS.ArrayBufferView>
			| AsyncIterable<string | NodeJS.ArrayBufferView>
			| Stream,
		options?:
			| (ObjectEncodingOptions & {
					mode?: Mode | undefined;
					flag?: OpenMode | undefined;
			  } & Abortable)
			| BufferEncoding
			| null,
	): Promise<void> {
		// Verify that the file size is within the allowed limit.
		if (
			this.maxFileSizeBytes !== undefined &&
			this.maxFileSizeBytes > 0 &&
			sizeof(data) > this.maxFileSizeBytes
		) {
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			throw new FilesystemError(SystemErrors.EFBIG, filepath.toString());
		}
		return this.fsManager.promises.writeFile(filepath, data, options);
	}
}

export class NodeFsManagerFactory implements IFileSystemManagerFactory {
	constructor(private readonly maxFileSizeBytes?: number) {}
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return new FsManagerWrapper(fs, this.maxFileSizeBytes);
	}
}

export class MemFsManagerFactory implements IFileSystemManagerFactory {
	public readonly volume = new Volume();
	constructor(private readonly maxFileSizeBytes?: number) {}
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return new FsManagerWrapper(
			this.volume as unknown as IFileSystemManager,
			this.maxFileSizeBytes,
		);
	}
}

export class RedisFsManagerFactory implements IFileSystemManagerFactory {
	private readonly redisParams: RedisParams;
	private readonly redisFsConfig: RedisFsConfig;

	constructor(
		config: Provider,
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		private readonly maxFileSizeBytes?: number,
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
		return new FsManagerWrapper(
			new RedisFsManager(
				this.redisParams,
				this.redisFsConfig,
				this.redisClientConnectionManager,
				fsManagerParams,
			),
			this.maxFileSizeBytes,
		);
	}
}
