/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Mode, type ObjectEncodingOptions, type OpenMode, type PathLike } from "node:fs";
import fsPromises from "node:fs/promises";
import type { Stream } from "node:stream";
import type { Abortable } from "node:events";
import sizeof from "object-sizeof";
import { type IFileSystemPromises } from "./definitions";
import { filepathToString, FilesystemError, SystemErrors } from "./fileSystemHelper";

export abstract class FsPromisesBase implements IFileSystemPromises {
	public readonly promises?: IFileSystemPromises;
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
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
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
			// eslint-disable-next-line @rushstack/no-new-null -- existing usage, won't address as we update the lint config
			| null,
	): Promise<void> {
		// Verify that the file size is within the allowed limit.
		if (
			this.maxFileSizeBytes !== undefined &&
			this.maxFileSizeBytes > 0 &&
			sizeof(data) > this.maxFileSizeBytes
		) {
			throw new FilesystemError(
				SystemErrors.EFBIG,
				`Attempted write size (${sizeof(data)} bytes) to ${filepathToString(
					filepath,
				)} exceeds limit (${this.maxFileSizeBytes} bytes).`,
			);
		}
		return this.writeFileCore(filepath, data, options);
	}
	public async unlink(
		...args: Parameters<typeof fsPromises.unlink>
	): ReturnType<typeof fsPromises.unlink> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.unlinkCore(...args);
	}
	public async readdir(
		...args: Parameters<typeof fsPromises.readdir>
	): ReturnType<typeof fsPromises.readdir> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.readdirCore(...args);
	}
	public async mkdir(
		...args: Parameters<typeof fsPromises.mkdir>
	): ReturnType<typeof fsPromises.mkdir> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.mkdirCore(...args);
	}
	public async rmdir(
		...args: Parameters<typeof fsPromises.rmdir>
	): ReturnType<typeof fsPromises.rmdir> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.rmdirCore(...args);
	}
	public async stat(
		...args: Parameters<typeof fsPromises.stat>
	): ReturnType<typeof fsPromises.stat> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.statCore(...args);
	}
	public async lstat(
		...args: Parameters<typeof fsPromises.lstat>
	): ReturnType<typeof fsPromises.lstat> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.lstatCore(...args);
	}
	public async readlink(
		...args: Parameters<typeof fsPromises.readlink>
	): ReturnType<typeof fsPromises.readlink> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.readlinkCore(...args);
	}
	public async symlink(
		...args: Parameters<typeof fsPromises.symlink>
	): ReturnType<typeof fsPromises.symlink> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.symlinkCore(...args);
	}
	public async chmod(
		...args: Parameters<typeof fsPromises.chmod>
	): ReturnType<typeof fsPromises.chmod> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.chmodCore(...args);
	}
	public async rm(...args: Parameters<typeof fsPromises.rm>): ReturnType<typeof fsPromises.rm> {
		if (args[0] === undefined) {
			throw new FilesystemError(SystemErrors.EINVAL, "File path is required.");
		}
		return this.rmCore(...args);
	}
}
