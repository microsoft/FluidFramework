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

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-description
/**
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

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export async function saveRC(rc: IResources): Promise<void> {
	const writeFile = util.promisify(fs.writeFile);
	const content = JSON.stringify(rc, undefined, 2);
	return writeFile(getRCFileName(), Buffer.from(content, "utf8"));
}

// TODO: Add documentation
// eslint-disable-next-line jsdoc/require-description
/**
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
