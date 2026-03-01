/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import execa from "execa";

/**
 * The output of `pnpm -r list` is an array of objects of this shape.
 */
export interface PnpmListEntry {
	name: string;
	version: string;
	path: string;
	private: boolean;
}

/**
 * Runs `pnpm -r list --depth=-1 --json` in the given directory and returns the parsed output.
 *
 * @param directory - The directory to run pnpm in.
 * @returns an array of PnpmListEntry objects, one for each package in the output.
 */
export async function pnpmList(directory: string): Promise<PnpmListEntry[]> {
	const raw = await execa(`pnpm`, [`-r`, `list`, `--depth=-1`, `--json`], {
		cwd: directory,
	});

	if (raw.stdout === undefined) {
		throw new Error(`No output from pnpm list.`);
	}

	const parsed = JSON.parse(raw.stdout) as PnpmListEntry[];
	return parsed;
}
