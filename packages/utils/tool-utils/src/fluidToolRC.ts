/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import { IOdspTokens } from "@fluidframework/odsp-doclib-utils/internal";
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
		data: {
			[key: string]: {
				storage?: IOdspTokens;
				push?: IOdspTokens;
			};
		};
	};
}

const getRCFileName = () => path.join(os.homedir(), ".fluidtoolrc");

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
		} catch (e) {
			// Nothing
		}
	}
	return {};
}

/**
 * @internal
 */
export async function saveRC(rc: IResources) {
	const writeFile = util.promisify(fs.writeFile);
	const content = JSON.stringify(rc, undefined, 2);
	return writeFile(getRCFileName(), Buffer.from(content, "utf8"));
}

/**
 * @internal
 */
export async function lockRC() {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return lock(getRCFileName(), {
		retries: {
			forever: true,
		},
		stale: 60000,
		realpath: false,
	});
}
