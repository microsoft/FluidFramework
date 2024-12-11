/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BigIntStats,
	BufferEncodingOption,
	Dirent,
	MakeDirectoryOptions,
	Mode,
	OpenMode,
	PathLike,
	RmDirOptions,
	RmOptions,
	StatOptions,
	Stats,
	ObjectEncodingOptions,
} from "fs";
import { FileHandle } from "fs/promises";
import { Stream } from "stream";
import { Abortable } from "events";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { IFileSystemManager, IFileSystemManagerParams, IFileSystemPromises } from "../definitions";
import { getStats, packedRefsFileName, SystemErrors } from "../fileSystemHelper";
import { FsPromisesBase } from "../fileSystemBase";
import { HashMapRedis, IRedis, Redis, RedisParams } from "./redis";
import {
	executeRedisFsApiWithMetric,
	RedisFsApis,
	RedisFSConstants,
	RedisFsError,
} from "./helpers";

export interface RedisFsConfig {
	enableRedisFsMetrics: boolean;
	redisApiMetricsSamplingPeriod: number;
	enableOptimizedStat: boolean;
}

export class RedisFsManager implements IFileSystemManager {
	// isomorphic-git assumes promise-style APIs from the file system implementation
	// For example, if the file system implementation given to isomorphic-git
	// is `fs`, it would do `fs.promises.readfile()`. Therefore, we wrap `RedisFs`
	// in `RedisFsManager`, with a `promises` property
	public readonly promises: IFileSystemPromises;

	constructor(
		redisParam: RedisParams,
		redisFsConfig: RedisFsConfig,
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		fsManagerParams?: IFileSystemManagerParams,
		maxFileSizeBytes?: number,
	) {
		this.promises = RedisFs.getInstance(
			redisParam,
			redisFsConfig,
			this.redisClientConnectionManager,
			fsManagerParams,
			maxFileSizeBytes,
		);
	}
}

export class RedisFs extends FsPromisesBase {
	public readonly redisFsClient: IRedis;

	constructor(
		redisParams: RedisParams,
		private readonly redisFsConfig: RedisFsConfig,
		private readonly redisClientConnectionManager: IRedisClientConnectionManager,
		fsManagerParams?: IFileSystemManagerParams,
		maxFileSizeBytes?: number,
	) {
		super(maxFileSizeBytes);
		this.redisFsClient =
			fsManagerParams?.rootDir && redisParams.enableHashmapRedisFs
				? new HashMapRedis(
						fsManagerParams.rootDir,
						this.redisClientConnectionManager,
						redisParams,
				  )
				: new Redis(this.redisClientConnectionManager, redisParams);
	}

	public static getInstance(
		redisParams: RedisParams,
		redisFsConfig: RedisFsConfig,
		redisClientConnectionManager: IRedisClientConnectionManager,
		fsManagerParams?: IFileSystemManagerParams,
		maxFileSizeBytes?: number,
	): RedisFs {
		return new RedisFs(
			redisParams,
			redisFsConfig,
			redisClientConnectionManager,
			fsManagerParams,
			maxFileSizeBytes,
		);
	}

	/**
	 * Asynchronously reads the entire contents of a file.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L83
	 */
	public async readFileCore(
		filepath: PathLike | FileHandle,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: { encoding?: null | undefined; flag?: OpenMode | undefined } | null,
	): Promise<Buffer>;
	public async readFileCore(
		filepath: PathLike | FileHandle,
		options: { encoding: BufferEncoding; flag?: OpenMode | undefined } | BufferEncoding,
	): Promise<string>;
	public async readFileCore(
		filepath: PathLike | FileHandle,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: (ObjectEncodingOptions & { flag?: OpenMode | undefined }) | BufferEncoding | null,
	): Promise<Buffer | string>;
	public async readFileCore(
		filepath: PathLike | FileHandle,
		options?: any,
	): Promise<Buffer | string> {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		const filepathString = filepath.toString();
		// Do not read packed-ref files which are not supported in r11s scenarios
		if (filepathString.includes(packedRefsFileName)) {
			return "";
		}

		const data = await executeRedisFsApiWithMetric(
			async () => this.redisFsClient.get<string | Buffer>(filepathString),
			RedisFsApis.ReadFile,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
			true,
		);
		if (data === undefined) {
			throw new RedisFsError(SystemErrors.ENOENT, filepathString);
		}
		return data;
	}

	/**
	 * Asynchronously writes data to a file, replacing the file if it already exists.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L101
	 */
	public async writeFileCore(
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
			// eslint-disable-next-line @rushstack/no-new-null
			| null,
	): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-base-to-string
		const filepathString = filepath.toString();
		// Do not write packed-ref files which are not supported in r11s scenarios
		if (filepathString.includes(packedRefsFileName)) {
			return;
		}

		const result = await executeRedisFsApiWithMetric(
			async () => this.redisFsClient.set(filepathString, data),
			RedisFsApis.WriteFile,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
		);

		return result;
	}

	/**
	 * Removes a link or a file. If path refers to a symbolic link, then the link is removed without affecting the file
	 * or directory to which that link refers. If the path refers to a file path that is not a symbolic link, the file
	 * is deleted. GitRest does not use symlinks in its Git
	 * repos. Therefore, unlink always removes the target file.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L143
	 */
	public async unlinkCore(filepath: PathLike): Promise<void> {
		const filepathString = filepath.toString();

		await executeRedisFsApiWithMetric(
			async () => this.redisFsClient.del(filepathString),
			RedisFsApis.Unlink,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
		);
	}

	/**
	 * Reads the contents of a directory.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L167
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L186
	 * isomorphic-git never provides options, and always expects string[] results.
	 */
	public async readdirCore(
		folderpath: PathLike,
		options?:
			| (ObjectEncodingOptions & { withFileTypes?: false | undefined })
			| BufferEncoding
			// eslint-disable-next-line @rushstack/no-new-null
			| null,
	): Promise<string[]>;
	public async readdirCore(
		folderpath: PathLike,
		options: { encoding: "buffer"; withFileTypes?: false | undefined } | "buffer",
	): Promise<Buffer[]>;
	public async readdirCore(
		folderpath: PathLike,
		options?:
			| (ObjectEncodingOptions & { withFileTypes?: false | undefined })
			| BufferEncoding
			// eslint-disable-next-line @rushstack/no-new-null
			| null,
	): Promise<string[] | Buffer[]>;
	public async readdirCore(
		folderpath: PathLike,
		options: ObjectEncodingOptions & { withFileTypes: true },
	): Promise<Dirent[]>;
	public async readdirCore(
		folderpath: PathLike,
		options?: any,
	): Promise<string[] | Buffer[] | Dirent[]> {
		const folderpathString = folderpath.toString();

		const result = await executeRedisFsApiWithMetric(
			async () => this.redisFsClient.keysByPrefix(folderpathString),
			RedisFsApis.Readdir,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				folderpathString,
			},
		);

		return result;
	}

	/**
	 * Asynchronously creates a directory.
	 * For the redis implementation, the subdiretories are not useful.
	 * Therefore, we ignore the recursive flag.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L115
	 */
	public async mkdirCore(
		folderpath: PathLike,
		options: MakeDirectoryOptions & { recursive: true },
	): Promise<string | undefined>;
	public async mkdirCore(
		folderpath: PathLike,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: Mode | (MakeDirectoryOptions & { recursive?: false | undefined }) | null,
	): Promise<void>;
	public async mkdirCore(
		folderpath: PathLike,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: Mode | MakeDirectoryOptions | null,
	): Promise<string | undefined>;
	public async mkdirCore(
		folderpath: PathLike,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: Mode | MakeDirectoryOptions | null,
	): Promise<undefined | string | void> {
		const folderpathString = folderpath.toString();
		const recursive = options && typeof options === "object" && options.recursive;

		if (recursive) {
			const folderSeparator = "/";
			const subfolders = folderpathString.split(folderSeparator);
			const subFolderPaths: string[] = [];
			for (let i = 1; i <= subfolders.length; i++) {
				subFolderPaths.push(subfolders.slice(0, i).join(folderSeparator));
			}
			await setDirPath(subFolderPaths, this.redisFsClient, this.redisFsConfig);
		} else {
			await setDirPath([folderpathString], this.redisFsClient, this.redisFsConfig);
		}

		async function setDirPath(
			paths: string[],
			redisFsClient: IRedis,
			redisFsConfig: RedisFsConfig,
		): Promise<void> {
			await executeRedisFsApiWithMetric(
				async (): Promise<void> =>
					redisFsClient.setMany(paths.map((path) => ({ key: path, value: "" }))),
				RedisFsApis.Mkdir,
				redisFsConfig.enableRedisFsMetrics,
				redisFsConfig.redisApiMetricsSamplingPeriod,
				{ folderpathString: paths.length > 1 ? paths.join(", ") : paths[0] },
			);
		}
	}

	/**
	 * Removes the directory identified by folderpath. For removing subdirectories and files,
	 * `rm` should be used instead.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L152
	 */
	public async rmdirCore(folderpath: PathLike, options?: RmDirOptions): Promise<void> {
		const folderpathString = folderpath.toString();

		// Technically this should only be done for `options.recursive === true`, but
		// this method is used by `rm(..., {recursive: true}).
		// If implementing this as an actual FS, this should fail if directory is not empty, and
		// `delAll` usage should be moved to `rm` instead.
		await executeRedisFsApiWithMetric(
			async () => this.redisFsClient.delAll(folderpathString),
			RedisFsApis.Rmdir,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				folderpathString,
			},
		).catch((error) =>
			Lumberjack.error("An error occurred while deleting keys", undefined, error),
		);
	}

	/**
	 * Returns an fs.Stat object for a given filepath. fs.Stat provides information about
	 * a file or folder.
	 * `fs.Stats` would usually include information like file size and modified time. However, it is
	 * very expensive to fetch that information from redis every time. Because we don't employ
	 * fields like `stats.size` and `stats.mtime` in our specific use-case scenario of isomorphic-git,
	 * we can avoid making "get properties" requests to the filesystem, as the only other types of information
	 * we need are whether a path exists and whether it refers to a file or directory. We can compute that
	 * independently. (Please note that we are initially enabling this change for only a subset of tenants)
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L61
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L191
	 * Neither isomorphic-git nor GitRest currently use the options parameter.
	 */
	public async statCore(
		filepath: PathLike,
		options?: StatOptions & { bigint?: false | undefined },
	): Promise<Stats>;
	public async statCore(
		filepath: PathLike,
		options: StatOptions & { bigint: true },
	): Promise<BigIntStats>;
	public async statCore(filepath: PathLike, options?: StatOptions): Promise<Stats | BigIntStats>;
	public async statCore(filepath: PathLike, options?: any): Promise<Stats | BigIntStats> {
		const filepathString = filepath.toString();
		const dataLength = await executeRedisFsApiWithMetric(
			async () => {
				if (this.redisFsConfig.enableOptimizedStat) {
					return this.redisFsClient.peek(filepathString);
				}
				const data = await this.redisFsClient.get<string | Buffer>(filepathString);
				if (data === null || data === undefined) {
					return -1;
				}
				return data.length;
			},
			RedisFsApis.Stat,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
			true,
		);

		if (dataLength === -1) {
			throw new RedisFsError(SystemErrors.ENOENT, filepath.toString());
		}

		const fsEntityType = dataLength === 0 ? RedisFSConstants.directory : RedisFSConstants.file;

		return getStats(fsEntityType);
	}

	/**
	 * Asynchronously removes files and directories (modeled on the standard POSIX `rm` utility).
	 * Even though `rm` is optional to isomorphic-git, we need to implement it because of this:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L19-L24.
	 * isomorphic-git provides a workaround implementation for `rm`, but it is not used if our `rmdir`
	 * implementation takes more than 1 argument. And since we implement `rmdir` taking 2 arguments
	 * in order to conform with `IFileSystemPromises`, we end up having to provide an `rm` implementation.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L155
	 */
	public async rmCore(filepath: PathLike, options?: RmOptions): Promise<void> {
		const filepathString = filepath.toString();
		if (options?.recursive) {
			return this.rmdir(filepath);
		}

		await executeRedisFsApiWithMetric(
			async () => this.redisFsClient.del(filepathString),
			RedisFsApis.Removefile,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
		);
	}

	/**
	 * Equivalent to `stat()` in a traditional filesystem implementation, unless path refers to a symbolic link.
	 * In that case the link itself is stat-ed, not the file that it refers to. For our cases,
	 * there are no symbolic links, `lstat()` is fully equivalent to `stat()`.
	 */
	// For more info on how isomorphic-git uses this, see:
	// https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L203
	public async lstatCore(
		path: PathLike,
		opts?: StatOptions & { bigint?: false | undefined },
	): Promise<Stats>;
	public async lstatCore(
		path: PathLike,
		opts: StatOptions & { bigint: true },
	): Promise<BigIntStats>;
	public async lstatCore(path: PathLike, opts?: StatOptions): Promise<Stats | BigIntStats>;
	public async lstatCore(filepath: string, options?: any): Promise<Stats | BigIntStats> {
		return this.stat(filepath, {
			...options,
			calledFromLStat: true,
		});
	}

	/**
	 * Reads the contents of the symbolic link referred to by path.
	 * Optional function as described in:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/docs/fs.md#using-the-promise-api-preferred
	 * readlink and symlink are only needed to work with git repos that contain symlinks, and that is not
	 * the case with GitRest. However, the function needs to be defined to avoid errors in isomorphic-git.
	 * It will just never be called.
	 */
	public async readlinkCore(
		filepath: PathLike,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: ObjectEncodingOptions | BufferEncoding | null,
	): Promise<string>;
	public async readlinkCore(filepath: PathLike, options: BufferEncodingOption): Promise<Buffer>;
	public async readlinkCore(
		filepath: PathLike,
		// eslint-disable-next-line @rushstack/no-new-null
		options?: ObjectEncodingOptions | string | null,
	): Promise<string | Buffer>;
	public async readlinkCore(filepath: PathLike, options: any): Promise<string | Buffer> {
		throw Error("Not implemented");
	}

	/**
	 * Creates a symbolic link.
	 * Optional function as described in:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/docs/fs.md#using-the-promise-api-preferred
	 * readlink and symlink are only needed to work with git repos that contain symlinks, and that is not
	 * the case with GitRest. However, the function needs to be defined to avoid errors in isomorphic-git.
	 * It will just never be called.
	 */
	public async symlinkCore(
		target: PathLike,
		filepath: PathLike,
		// eslint-disable-next-line @rushstack/no-new-null
		type?: string | null,
	): Promise<void> {
		throw Error("Not implemented");
	}

	/**
	 * Changes the permissions of a file.
	 * Optional function as described in:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/docs/fs.md#using-the-promise-api-preferred
	 * Right now, isomorphic-git rewrites the file if it needs to change its mode.
	 * In the future, if chmod is available, isomorphic-git will use it. We need to define the function to
	 * comply with `IFileSystemPromises`.
	 */
	public async chmodCore(filepath: PathLike, mode: Mode): Promise<void> {
		throw Error("Not implemented");
	}
}
