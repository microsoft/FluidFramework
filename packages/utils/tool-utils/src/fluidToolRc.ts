/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";

import type { IOdspTokens } from "@fluidframework/odsp-doclib-utils/internal";
import { lock } from "proper-lockfile";

/**
 * @internal
 */
export interface IAsyncCache<TKey, TValue> {
	get(key: TKey): Promise<TValue | undefined>;
	save(key: TKey, value: TValue): Promise<void>;
	lock<T>(callback: () => Promise<T>): Promise<T>;
}

/**
 * @internal
 */
export interface IResources {
	tokens?: {
		version?: number;
		data: Record<
			string,
			{
				storage?: IOdspTokens;
				push?: IOdspTokens;
			}
		>;
	};
}

const getRCFileName = (): string => path.join(os.homedir(), ".fluidtoolrc");

/**
 * Loads the Fluid tool resource cache from `.fluidtoolrc` in the current user's home directory.
 *
 * @returns The parsed resources, or an empty object if the file does not exist or contains invalid
 * JSON.
 * @throws If the file exists but cannot be read.
 * @internal
 */
export async function loadRC(): Promise<IResources> {
	const readFile = util.promisify(fs.readFile);
	const exists = util.promisify(fs.exists);
	const fileName = getRCFileName();
	if (await exists(fileName)) {
		const buf = await readFile(fileName);
		try {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return JSON.parse(buf.toString("utf8"));
		} catch {
			// Nothing
		}
	}
	return {};
}

/**
 * Saves the Fluid tool resources to `.fluidtoolrc` in the current user's home directory.
 *
 * On POSIX filesystems, successful completion ensures the file has owner-only read/write
 * permissions. Windows continues to rely on the access controls inherited from the user's home
 * directory.
 *
 * @param rc - The resources to serialize and save.
 * @throws If serialization, writing, or updating the file permissions fails. A permission-update
 * failure occurs after the new contents have already been written.
 * @internal
 */
export async function saveRC(rc: IResources): Promise<void> {
	const writeFile = util.promisify(fs.writeFile);
	const chmod = util.promisify(fs.chmod);
	const content = JSON.stringify(rc, undefined, 2);
	const fileName = getRCFileName();
	// This per-user file holds ODSP access tokens and may also hold development secrets.
	// On POSIX filesystems, `mode` creates a new file as owner-readable/writable only (0600).
	// Because `mode` does not change an existing file, chmod also repairs caches that were
	// previously created with broader permissions. On Windows, these calls normally succeed,
	// but Node only uses the write bit: 0600 keeps the file writable without restricting who can
	// read it. Confidentiality therefore depends on ACLs inherited from the user's home directory.
	// If the filesystem rejects chmod, saveRC rejects after the file has already been written.
	await writeFile(fileName, Buffer.from(content, "utf8"), { mode: 0o600 });
	await chmod(fileName, 0o600);
}

/**
 * Acquires the inter-process lock for `.fluidtoolrc` in the current user's home directory.
 *
 * The lock may be acquired before the resource file exists. While another process holds the lock,
 * acquisition retries indefinitely. Locks whose modification time has not been updated for 60
 * seconds are considered stale.
 *
 * @returns An asynchronous callback that releases the lock. The caller must invoke it after
 * completing the protected operation, including when that operation fails.
 * @throws If a filesystem error prevents the lock from being acquired.
 * @internal
 */
export async function lockRC(): Promise<() => Promise<void>> {
	return lock(getRCFileName(), {
		retries: {
			forever: true,
		},
		stale: 60000,
		realpath: false,
	});
}
