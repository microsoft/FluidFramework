/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PathLike } from "fs";
import fsPromises from "node:fs/promises";

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Queue } from "bullmq";

import type {
	IFileSystemManager,
	IFileSystemManagerParams,
	IFileSystemPromises,
} from "../definitions";
import { FilesystemError, SystemErrors } from "../fileSystemHelper";

export class HybridFsManager implements IFileSystemManager {
	// isomorphic-git assumes promise-style APIs from the file system implementation
	// For example, if the file system implementation given to isomorphic-git
	// is `fs`, it would do `fs.promises.readfile()`. Therefore, we wrap `RedisFs`
	// in `RedisFsManager`, with a `promises` property
	public readonly promises: IFileSystemPromises;

	constructor(
		l1FileSystem: IFileSystemManager,
		l2FileSystem: IFileSystemManager,
		l2AsyncQueue: Queue,
		params?: IFileSystemManagerParams,
	) {
		this.promises = new HybridFs(
			l1FileSystem.promises,
			l2FileSystem.promises,
			l2AsyncQueue,
			params,
		);
	}
}

export class HybridFs implements IFileSystemPromises {
	public constructor(
		private readonly l1FileSystem: IFileSystemPromises,
		private readonly l2FileSystem: IFileSystemPromises,
		private readonly l2AsyncQueue: Queue,
		private readonly params?: IFileSystemManagerParams,
	) {}
	public async readFile(
		...args: Parameters<typeof fsPromises.readFile>
	): ReturnType<typeof fsPromises.readFile> {
		this.validFilePath(args[0]);
		try {
			const l1Result = await this.l1FileSystem.readFile(...args);
			if (l1Result !== undefined) {
				return l1Result;
			}
		} catch (error) {
			// If there is an error, we try to read from the second file system
			// Behavior might need to change based on the error type and our needs
			// For now, we just log the error and try to read from the second file system
			Lumberjack.error("HybridFs: Error readFile from l1FileSystem", undefined, error);
		}
		return this.l2FileSystem.readFile(...args);
	}

	public async writeFile(
		...args: Parameters<typeof fsPromises.writeFile>
	): ReturnType<typeof fsPromises.writeFile> {
		this.validFilePath(args[0]);
		const l1Result = await this.l1FileSystem.writeFile(...args);
		await this.l2AsyncQueue.add("writeFile", { args, fileSystemParams: this.params });
		return l1Result;
	}

	public async unlink(
		...args: Parameters<typeof fsPromises.unlink>
	): ReturnType<typeof fsPromises.unlink> {
		// Doesn't seems to be used in code
		this.validFilePath(args[0]);
		await this.l1FileSystem.unlink(...args);
		return this.l2FileSystem.unlink(...args);
	}

	public async readdir(
		...args: Parameters<typeof fsPromises.readdir>
	): ReturnType<typeof fsPromises.readdir> {
		this.validFilePath(args[0]);
		try {
			const l1Result = await this.l1FileSystem.readdir(...args);
			if (l1Result !== undefined) {
				return l1Result;
			}
		} catch (error) {
			// If there is an error, we try to read from the second file system
			// Behavior might need to change based on the error type and our needs
			// For now, we just log the error and try to read from the second file system
			Lumberjack.error("HybridFs: Error readdir from l1FileSystem", undefined, error);
		}
		return this.l2FileSystem.readdir(...args);
	}

	public async mkdir(
		...args: Parameters<typeof fsPromises.mkdir>
	): ReturnType<typeof fsPromises.mkdir> {
		this.validFilePath(args[0]);
		const l1Result = await this.l1FileSystem.mkdir(...args);
		Lumberjack.info("HybridFs: l1Result for mkdir", { l1Result });
		await this.l2AsyncQueue.add("mkdir", { args, fileSystemParams: this.params });
		return l1Result;
	}

	public async rmdir(
		...args: Parameters<typeof fsPromises.rmdir>
	): ReturnType<typeof fsPromises.rmdir> {
		this.validFilePath(args[0]);
		await this.l1FileSystem.rmdir(...args);
		return this.l2FileSystem.rmdir(...args); // TODO: put this on a queue
	}

	public async stat(
		...args: Parameters<typeof fsPromises.stat>
	): ReturnType<typeof fsPromises.stat> {
		try {
			const l1Result = await this.l1FileSystem.stat(...args);
			if (l1Result !== undefined) {
				return l1Result;
			}
		} catch (error) {
			// If there is an error, we try to read from the second file system
			// Behavior might need to change based on the error type and our needs
			// For now, we just log the error and try to read from the second file system
			Lumberjack.error("HybridFs: Error stat from l1FileSystem", undefined, error);
		}
		return this.l2FileSystem.stat(...args);
	}

	public async lstat(
		...args: Parameters<typeof fsPromises.lstat>
	): ReturnType<typeof fsPromises.lstat> {
		this.validFilePath(args[0]);
		try {
			const l1Result = await this.l1FileSystem.lstat(...args);
			if (l1Result !== undefined) {
				return l1Result;
			}
		} catch (error) {
			// If there is an error, we try to read from the second file system
			// Behavior might need to change based on the error type and our needs
			// For now, we just log the error and try to read from the second file system
			Lumberjack.error("HybridFs: Error lstat from l1FileSystem", undefined, error);
		}
		return this.l2FileSystem.lstat(...args);
	}

	public async readlink(
		...args: Parameters<typeof fsPromises.readlink>
	): ReturnType<typeof fsPromises.readlink> {
		throw new FilesystemError(SystemErrors.EISDIR, "readlink is not supported.");
	}

	public async symlink(
		...args: Parameters<typeof fsPromises.symlink>
	): ReturnType<typeof fsPromises.symlink> {
		throw new FilesystemError(SystemErrors.EISDIR, "symlink is not supported.");
	}

	public async chmod(
		...args: Parameters<typeof fsPromises.chmod>
	): ReturnType<typeof fsPromises.chmod> {
		throw new FilesystemError(SystemErrors.EISDIR, "chmod is not supported.");
	}

	public async rm(...args: Parameters<typeof fsPromises.rm>): ReturnType<typeof fsPromises.rm> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		await this.l1FileSystem.rm(...args);
		return this.l2FileSystem.rm(...args); // TODO: put this on a queue
	}

	private validFilePath(path: PathLike | fsPromises.FileHandle) {
		if (path === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
	}
}
