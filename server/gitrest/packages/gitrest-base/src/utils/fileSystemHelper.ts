/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import fs, { type PathLike } from "fs";
import type { FileHandle } from "fs/promises";

export const packedRefsFileName = "packed-refs";

export type FsEntityType = "file" | "directory" | "symlink";

export interface ISystemError {
	code: string;
	description: string;
	httpStatusCode: number;
}

export const SystemErrors: Record<string, ISystemError> = {
	EEXIST: {
		code: "EEXIST",
		description: "File already exists",
		httpStatusCode: 409,
	},
	EINVAL: {
		code: "EINVAL",
		description: "Invalid argument",
		httpStatusCode: 400,
	},
	EISDIR: {
		code: "EISDIR",
		description: "Illegal operation on a directory",
		httpStatusCode: 405,
	},
	ENOENT: {
		code: "ENOENT",
		description: "No such file or directory",
		httpStatusCode: 404,
	},
	ENOTDIR: {
		code: "ENOTDIR",
		description: "Not a directory",
		httpStatusCode: 406,
	},
	ENOTEMPTY: {
		code: "ENOTEMPTY",
		description: "Directory not empty",
		httpStatusCode: 409,
	},
	EFBIG: {
		code: "EFBIG",
		description: "File too large",
		httpStatusCode: 413,
	},
	UNKNOWN: {
		code: "UNKNOWN",
		description: "Unknown error",
		httpStatusCode: 500,
	},
};

const KnownSystemErrorCodes = new Set(Object.keys(SystemErrors));

export class FilesystemError extends Error {
	public get code() {
		return this.err.code;
	}

	constructor(
		public readonly err: ISystemError,
		message?: string,
	) {
		super(message ? `${err.description}: ${message}` : err.description);
		this.name = "FilesystemError";
	}
}

/**
 * Check if an error is a recognized FilesystemError (or RedisFsError).
 *
 * @param err - An unknown error object
 * @returns Whether the error object is a FilesystemError (or RedisFsError)
 */
export function isFilesystemError(err: unknown): err is FilesystemError {
	// This also works for RedisFsError which exposes a compatible code property.
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		typeof err.code === "string" &&
		KnownSystemErrorCodes.has(err.code)
	);
}

/**
 * If the error is a FilesystemError, throw it as a NetworkError with the appropriate status code.
 * Otherwise, rethrow the error as-is.
 *
 * @param err - An unknown error object
 */
export function throwFileSystemErrorAsNetworkError(err: FilesystemError): never {
	const systemError = SystemErrors[err.code] ?? SystemErrors.UNKNOWN;
	const error = new NetworkError(
		systemError.httpStatusCode,
		// Only use SystemError.description, not the message, to protect against leaking sensitive information.
		systemError.description,
		systemError.httpStatusCode === 500,
		undefined /* isFatal */,
		undefined /* retryAfterMs */,
		"Gitrest filesystem error",
	);
	throw error;
}

function isFileHandle(filepath: PathLike | FileHandle): filepath is FileHandle {
	return typeof filepath !== "string" && !Buffer.isBuffer(filepath) && "fd" in filepath;
}

/**
 * Convert a PathLike or FileHandle to a string path.
 * @remarks
 * This is useful for logging and debugging.
 * If the input is a FileHandle, the path is unknown and a generic message is returned, rather than using readLink.
 *
 * @param filepath - A PathLike or FileHandle
 * @returns The string representation of the path
 */
export function filepathToString(filepath: PathLike | FileHandle): string {
	if (isFileHandle(filepath)) {
		return "Unknown file handle path";
	}
	return filepath.toString();
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
