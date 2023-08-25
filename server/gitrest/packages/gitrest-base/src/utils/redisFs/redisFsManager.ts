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
import * as IoRedis from "ioredis";
import sizeof from "object-sizeof";
import { getRandomInt } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IFileSystemManager, IFileSystemPromises } from "../definitions";
import { getStats, ISystemError, packedRefsFileName, SystemErrors } from "../fileSystemHelper";
import { Redis, RedisParams } from "./redis";

export interface RedisFsConfig {
	enableRedisFsMetrics: boolean;
	redisApiMetricsSamplingPeriod: number;
}

export class RedisFsManager implements IFileSystemManager {
	// isomorphic-git assumes promise-style APIs from the file system implementation
	// For example, if the file system implementation given to isomorphic-git
	// is `fs`, it would do `fs.promises.readfile()`. Therefore, we wrap `RedisFs`
	// in `RedisFsManager`, with a `promises` property
	public readonly promises: IFileSystemPromises;
	constructor(
		redisParam: RedisParams,
		redisOptions: IoRedis.RedisOptions,
		redisFsConfig: RedisFsConfig,
	) {
		this.promises = new RedisFs(redisParam, redisOptions, redisFsConfig);
	}
}

export class RedisFs implements IFileSystemPromises {
	public readonly redisFsClient: Redis;
	constructor(
		redisParams: RedisParams,
		redisOptions: IoRedis.RedisOptions,
		private readonly redisFsConfig: RedisFsConfig,
	) {
		const redisClient = new IoRedis.default(redisOptions);
		this.redisFsClient = new Redis(redisClient, redisParams);
	}

	/**
	 * Asynchronously reads the entire contents of a file.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L83
	 */
	public async readFile(
		filepath: PathLike | FileHandle,
		options?: { encoding?: null | undefined; flag?: OpenMode | undefined } | null,
	): Promise<Buffer>;
	public async readFile(
		filepath: PathLike | FileHandle,
		options: { encoding: BufferEncoding; flag?: OpenMode | undefined } | BufferEncoding,
	): Promise<string>;
	public async readFile(
		path: PathLike | FileHandle,
		options?: (ObjectEncodingOptions & { flag?: OpenMode | undefined }) | BufferEncoding | null,
	): Promise<Buffer | string>;
	public async readFile(
		filepath: PathLike | FileHandle,
		options?: any,
	): Promise<Buffer | string> {
		const filepathString = filepath.toString();
		// Do not read packed-ref files which are not supported in r11s scenarios
		if (filepathString.includes(packedRefsFileName)) {
			return undefined;
		}

		const data = await executeRedisFsApi(
			async () => this.redisFsClient.get<string | Buffer>(filepathString),
			RedisFsApis.ReadFile,
			RedisFSConstants.RedisFsApi,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
			true,
		);
		return data;
	}

	/**
	 * Asynchronously writes data to a file, replacing the file if it already exists.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L101
	 */
	public async writeFile(
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
		const filepathString = filepath.toString();
		// Do not write packed-ref files which are not supported in r11s scenarios
		if (filepathString.includes(packedRefsFileName)) {
			return;
		}

		const result = await executeRedisFsApi(
			async () => this.redisFsClient.set(filepathString, data),
			RedisFsApis.WriteFile,
			RedisFSConstants.RedisFsApi,
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
	public async unlink(filepath: PathLike): Promise<void> {
		const filepathString = filepath.toString();

		await executeRedisFsApi(
			async () => this.redisFsClient.delete(filepathString),
			RedisFsApis.Unlink,
			RedisFSConstants.RedisFsApi,
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
	public async readdir(
		folderpath: PathLike,
		options?:
			| (ObjectEncodingOptions & { withFileTypes?: false | undefined })
			| BufferEncoding
			| null,
	): Promise<string[]>;
	public async readdir(
		folderpath: PathLike,
		options: { encoding: "buffer"; withFileTypes?: false | undefined } | "buffer",
	): Promise<Buffer[]>;
	public async readdir(
		folderpath: PathLike,
		options?:
			| (ObjectEncodingOptions & { withFileTypes?: false | undefined })
			| BufferEncoding
			| null,
	): Promise<string[] | Buffer[]>;
	public async readdir(
		folderpath: PathLike,
		options: ObjectEncodingOptions & { withFileTypes: true },
	): Promise<Dirent[]>;
	public async readdir(
		folderpath: PathLike,
		options?: any,
	): Promise<string[] | Buffer[] | Dirent[]> {
		const folderpathString = folderpath.toString();

		const result = await executeRedisFsApi(
			async () => this.redisFsClient.keysByPrefix(folderpathString),
			RedisFsApis.Readdir,
			RedisFSConstants.RedisFsApi,
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
	public async mkdir(
		folderpath: PathLike,
		options: MakeDirectoryOptions & { recursive: true },
	): Promise<string | undefined>;
	public async mkdir(
		folderpath: PathLike,
		options?: Mode | (MakeDirectoryOptions & { recursive?: false | undefined }) | null,
	): Promise<void>;
	public async mkdir(
		path: PathLike,
		options?: Mode | MakeDirectoryOptions | null,
	): Promise<string | undefined>;
	public async mkdir(
		folderpath: PathLike,
		options?: Mode | MakeDirectoryOptions | null,
	): Promise<undefined | string | void> {
		const folderpathString = folderpath.toString();
		const recursive = options && typeof options === "object" && options.recursive;

		if (recursive) {
			const folderSeparator = "/";
			const subfolders = folderpathString.split(folderSeparator);

			for (let i = 1; i <= subfolders.length; i++) {
				const currentPath = subfolders.slice(0, i).join(folderSeparator);
				await setDirPath(currentPath, this.redisFsClient, this.redisFsConfig);
			}
		} else {
			await setDirPath(folderpathString, this.redisFsClient, this.redisFsConfig);
		}

		async function setDirPath(
			path: string,
			redisFsClient: Redis,
			redisFsConfig: RedisFsConfig,
		): Promise<void> {
			await executeRedisFsApi(
				async (): Promise<void> => redisFsClient.set(path, ""),
				RedisFsApis.Mkdir,
				RedisFSConstants.RedisFsApi,
				redisFsConfig.enableRedisFsMetrics,
				redisFsConfig.redisApiMetricsSamplingPeriod,
				{ folderpathString: path },
			);
		}
	}

	/**
	 * Removes the directory identified by folderpath. For removing subdirectories and files,
	 * `rm` should be used instead.
	 * For more info on how isomorphic-git uses this, see:
	 * https://github.com/isomorphic-git/isomorphic-git/blob/main/src/models/FileSystem.js#L152
	 */
	public async rmdir(folderpath: PathLike, options?: RmDirOptions): Promise<void> {
		const folderpathString = folderpath.toString();

		const keysToRemove = await executeRedisFsApi(
			async () => this.redisFsClient.keysByPrefix(folderpathString),
			RedisFsApis.KeysByPrefix,
			RedisFSConstants.RedisFsApi,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				folderpathString,
			},
		);

		const deleteP = keysToRemove.map(async (key) => {
			return executeRedisFsApi(
				async () => this.redisFsClient.delete(key, false),
				RedisFsApis.Rmdir,
				RedisFSConstants.RedisFsApi,
				this.redisFsConfig.enableRedisFsMetrics,
				this.redisFsConfig.redisApiMetricsSamplingPeriod,
				{
					key,
				},
			);
		});

		await Promise.all(deleteP).catch((error) => {
			Lumberjack.error("An error occurred while deleting keys", null, error);
		});
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
	public async stat(
		filepath: PathLike,
		options?: StatOptions & { bigint?: false | undefined },
	): Promise<Stats>;
	public async stat(
		filepath: PathLike,
		options: StatOptions & { bigint: true },
	): Promise<BigIntStats>;
	public async stat(filepath: PathLike, options?: StatOptions): Promise<Stats | BigIntStats>;
	public async stat(filepath: PathLike, options?: any): Promise<Stats | BigIntStats> {
		const filepathString = filepath.toString();
		const data = await executeRedisFsApi(
			async () => this.redisFsClient.get<string | Buffer>(filepathString),
			RedisFsApis.Stat,
			RedisFSConstants.RedisFsApi,
			this.redisFsConfig.enableRedisFsMetrics,
			this.redisFsConfig.redisApiMetricsSamplingPeriod,
			{
				filepathString,
			},
			true,
		);

		if (data === null) {
			throw new RedisFsError(SystemErrors.ENOENT, filepath.toString());
		}

		const fsEntityType = data === "" ? RedisFSConstants.directory : RedisFSConstants.file;

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
	public async rm(filepath: PathLike, options?: RmOptions): Promise<void> {
		const filepathString = filepath.toString();
		if (options?.recursive) {
			return this.rmdir(filepath);
		}

		await executeRedisFsApi(
			async () => this.redisFsClient.delete(filepathString),
			RedisFsApis.Removefile,
			RedisFSConstants.RedisFsApi,
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
	public async lstat(
		path: PathLike,
		opts?: StatOptions & { bigint?: false | undefined },
	): Promise<Stats>;
	public async lstat(path: PathLike, opts: StatOptions & { bigint: true }): Promise<BigIntStats>;
	public async lstat(path: PathLike, opts?: StatOptions): Promise<Stats | BigIntStats>;
	public async lstat(filepath: string, options?: any): Promise<Stats | BigIntStats> {
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
	public async readlink(
		filepath: PathLike,
		options?: ObjectEncodingOptions | BufferEncoding | null,
	): Promise<string>;
	public async readlink(filepath: PathLike, options: BufferEncodingOption): Promise<Buffer>;
	public async readlink(
		filepath: PathLike,
		options?: ObjectEncodingOptions | string | null,
	): Promise<string | Buffer>;
	public async readlink(filepath: PathLike, options: any): Promise<string | Buffer> {
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
	public async symlink(
		target: PathLike,
		filepath: PathLike,
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
	public async chmod(filepath: PathLike, mode: Mode): Promise<void> {
		throw Error("Not implemented");
	}
}

class RedisFsError extends Error {
	public get code() {
		return this.err.code;
	}

	constructor(public readonly err: ISystemError, message?: string) {
		super(message ? `${err.description}: ${message}` : err.description);
		this.name = "RedisFsError";
	}
}

enum RedisFsApis {
	ReadFile = "ReadFile",
	WriteFile = "WriteFile",
	Unlink = "Unlink",
	Readdir = "Readdir",
	Removefile = "Removefile",
	Stat = "Stat",
	Mkdir = "Mkdir",
	Rmdir = "Rmdir",
	KeysByPrefix = "keysByPrefix",
}

enum RedisFSConstants {
	file = "file",
	directory = "directory",
	RedisFsApi = "RedisFsApi",
}

async function executeRedisFsApi<T>(
	api: () => Promise<T>,
	apiName: string,
	metricName: string,
	metricEnabled: boolean,
	samplingPeriod: number,
	telemetryProperties?: Record<string, any>,
	logResponseSize: boolean = false,
): Promise<T> {
	if (!metricEnabled || (samplingPeriod && getRandomInt(samplingPeriod) !== 0)) {
		return api();
	}

	const metric = Lumberjack.newLumberMetric(metricName, telemetryProperties);
	try {
		let responseSize;
		const result = await api();
		if (logResponseSize) {
			responseSize = sizeof(result);
		}
		metric.setProperty("responseSize", responseSize);
		metric.success(`${metricName}: ${apiName} success`);
		return result;
	} catch (error: any) {
		metric.error(`${metricName}: ${apiName} error`, error);
		throw error;
	}
}
