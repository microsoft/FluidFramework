/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

export const packedRefsFileName = "packed-refs";

export type FsEntityType = "file" | "directory" | "symlink";

export interface ISystemError {
	code: string;
	description: string;
}

export const SystemErrors: Record<string, ISystemError> = {
	EEXIST: {
		code: "EEXIST",
		description: "File already exists",
	},
	EINVAL: {
		code: "EINVAL",
		description: "Invalid argument",
	},
	EISDIR: {
		code: "EISDIR",
		description: "Illegal operation on a directory",
	},
	ENOENT: {
		code: "ENOENT",
		description: "No such file or directory",
	},
	ENOTDIR: {
		code: "ENOTDIR",
		description: "Not a directory",
	},
	ENOTEMPTY: {
		code: "ENOTEMPTY",
		description: "Directory not empty",
	},
	EFBIG: {
		code: "EFBIG",
		description: "File too large",
	},
	UNKNOWN: {
		code: "UNKNOWN",
		description: "Unknown error",
	},
};

export class FilesystemError extends Error {
	public get code() {
		return this.err.code;
	}

	constructor(public readonly err: ISystemError, message?: string) {
		super(message ? `${err.description}: ${message}` : err.description);
		this.name = "FilesystemError";
	}
}

/**
 * Creates an `fs.Stats` object using the information retrieved through the filesystem APIs.
 * GitRest and isomorphic-git expect `fs.Stats` objects, but we don't use `fs` to obtain them.
 * We handcraft those `fs.Stats` ourselves with the data coming from the file system.
 * `fs.Stats` would usually include information like file size and modified time. However, it is
 * very expensive to fetch that information in our custom fs. Because we don't employ those particular
 * fields in our specific use-case scenario of isomorphic-git, we just set default values here.
 * @param type - the type of the filesystem entity. E.g. file, directory, symlink
 * @param lastModified - `Date` representing the last modified time of the filesystem entity
 * @param size - size in bytes of the filesystem entity
 * @returns an `fs.Stats` object
 */
export function getStats(type?: FsEntityType, lastModified?: Date, size?: number): fs.Stats {
	const computedLastModified = new Date(0);
	const computedLastModifiedInMs = computedLastModified.getTime();
	const defaultStats = new fs.Stats();
	switch (type) {
		case "file":
			defaultStats.mode = fs.constants.S_IFREG;
			break;
		case "directory":
			defaultStats.mode = fs.constants.S_IFDIR;
			break;
		case "symlink":
			defaultStats.mode = fs.constants.S_IFLNK;
			break;
		default:
			defaultStats.mode = fs.constants.S_IFREG;
	}
	const lastModifiedInMs = lastModified?.getTime();

	defaultStats.size = size ?? 1;
	defaultStats.uid = 0;
	defaultStats.gid = 0;
	defaultStats.ino = 0;
	defaultStats.dev = 0;
	defaultStats.mtime = lastModified ?? computedLastModified;
	defaultStats.mtimeMs = lastModifiedInMs ?? computedLastModifiedInMs;
	defaultStats.ctime = lastModified ?? computedLastModified;
	defaultStats.ctimeMs = lastModifiedInMs ?? computedLastModifiedInMs;

	return defaultStats;
}
