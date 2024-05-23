/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs, { type Mode, type ObjectEncodingOptions, type OpenMode, type PathLike } from "node:fs";
import * as fsPromises from "node:fs/promises";
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

export abstract class FsPromisesBase implements IFileSystemPromises {
	public readonly promises: IFileSystemPromises;
	constructor(private readonly maxFileSizeBytes?: number) {}

	protected abstract readFileCore(
		...args: Parameters<typeof fsPromises.readFile>
	): ReturnType<typeof fsPromises.readFile>;
	protected abstract writeFileCore(
		...args: Parameters<typeof fsPromises.writeFile>
	): ReturnType<typeof fsPromises.writeFile>;
	protected abstract unlinkCore(
		...args: Parameters<typeof fsPromises.unlink>
	): ReturnType<typeof fsPromises.unlink>;
	protected abstract readdirCore(
		...args: Parameters<typeof fsPromises.readdir>
	): ReturnType<typeof fsPromises.readdir>;
	protected abstract mkdirCore(
		...args: Parameters<typeof fsPromises.mkdir>
	): ReturnType<typeof fsPromises.mkdir>;
	protected abstract rmdirCore(
		...args: Parameters<typeof fsPromises.rmdir>
	): ReturnType<typeof fsPromises.rmdir>;
	protected abstract statCore(
		...args: Parameters<typeof fsPromises.stat>
	): ReturnType<typeof fsPromises.stat>;
	protected abstract lstatCore(
		...args: Parameters<typeof fsPromises.lstat>
	): ReturnType<typeof fsPromises.lstat>;
	protected abstract readlinkCore(
		...args: Parameters<typeof fsPromises.readlink>
	): ReturnType<typeof fsPromises.readlink>;
	protected abstract symlinkCore(
		...args: Parameters<typeof fsPromises.symlink>
	): ReturnType<typeof fsPromises.symlink>;
	protected abstract chmodCore(
		...args: Parameters<typeof fsPromises.chmod>
	): ReturnType<typeof fsPromises.chmod>;
	protected abstract rmCore(
		...args: Parameters<typeof fsPromises.rm>
	): ReturnType<typeof fsPromises.rm>;

	public async readFile(
		...args: Parameters<typeof fsPromises.readFile>
	): ReturnType<typeof fsPromises.readFile> {
		return this.readFileCore(...args);
	}
	/**
	 * Asynchronously writes data to a file, replacing the file if it already exists.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L101
	 */
	public async writeFile(
		filepath: PathLike | fsPromises.FileHandle,
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
		return this.writeFileCore(filepath, data, options);
	}
	public async unlink(
		...args: Parameters<typeof fsPromises.unlink>
	): ReturnType<typeof fsPromises.unlink> {
		return this.unlinkCore(...args);
	}
	public async readdir(
		...args: Parameters<typeof fsPromises.readdir>
	): ReturnType<typeof fsPromises.readdir> {
		return this.readdirCore(...args);
	}
	public async mkdir(
		...args: Parameters<typeof fsPromises.mkdir>
	): ReturnType<typeof fsPromises.mkdir> {
		return this.mkdirCore(...args);
	}
	public async rmdir(
		...args: Parameters<typeof fsPromises.rmdir>
	): ReturnType<typeof fsPromises.rmdir> {
		return this.rmdirCore(...args);
	}
	public async stat(
		...args: Parameters<typeof fsPromises.stat>
	): ReturnType<typeof fsPromises.stat> {
		return this.statCore(...args);
	}
	public async lstat(
		...args: Parameters<typeof fsPromises.lstat>
	): ReturnType<typeof fsPromises.lstat> {
		return this.lstatCore(...args);
	}
	public async readlink(
		...args: Parameters<typeof fsPromises.readlink>
	): ReturnType<typeof fsPromises.readlink> {
		return this.readlinkCore(...args);
	}
	public async symlink(
		...args: Parameters<typeof fsPromises.symlink>
	): ReturnType<typeof fsPromises.symlink> {
		return this.symlinkCore(...args);
	}
	public async chmod(
		...args: Parameters<typeof fsPromises.chmod>
	): ReturnType<typeof fsPromises.chmod> {
		return this.chmodCore(...args);
	}
	public async rm(...args: Parameters<typeof fsPromises.rm>): ReturnType<typeof fsPromises.rm> {
		return this.rmCore(...args);
	}
}

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
		return new SimpleFsPromisesWrapper(fs.promises, this.maxFileSizeBytes);
	}
}

export class MemFsManagerFactory implements IFileSystemManagerFactory {
	public readonly volume = new Volume();
	constructor(private readonly maxFileSizeBytes?: number) {}
	public create(params?: IFileSystemManagerParams): IFileSystemManager {
		return new SimpleFsPromisesWrapper(
			this.volume.promises as unknown as IFileSystemPromises,
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
		return new RedisFsManager(
			this.redisParams,
			this.redisFsConfig,
			this.redisClientConnectionManager,
			fsManagerParams,
			this.maxFileSizeBytes,
		);
	}
}
