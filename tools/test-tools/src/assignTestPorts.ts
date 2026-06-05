/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Package metadata returned by `pnpm recursive list --json`.
 */
export interface PackageInfo {
	name: string;
	version: string;
	private: string;
	path: string;
}

/**
 * Gets and parses a PackageInfo for packages in the workspace.
 */
export function getPackageInfo(): PackageInfo[] {
	try {
		const child = spawnSync("pnpm", ["recursive", "list", "--json", "--depth=-1"], {
			encoding: "utf8",
			// shell:true is required for Windows without a resolved path to pnpm.
			shell: true,
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const info: PackageInfo[] = JSON.parse(child.stdout);
		if (!Array.isArray(info)) {
			// eslint-disable-next-line unicorn/prefer-type-error
			throw new Error(
				`stdin input was not package array. Spawn result: ${JSON.stringify(child)}`,
			);
		}
		return info;
	} catch (error) {
		console.error(error);
		process.exit(-1);
	}
}

/**
 * Writes package-to-port mappings to a temp file for tests to consume.
 */
export function writePortMapFile(initialPort: number): void {
	const info: PackageInfo[] = getPackageInfo();

	// Assign a unique port to each package
	const portMap: Record<string, number> = {};
	let port = initialPort;
	for (const pkg of info) {
		if (pkg.name === undefined) {
			console.error("missing name in package info");
			process.exit(-1);
		}
		portMap[pkg.name] = port++;
	}

	// Write the mappings to a temporary file as kv pairs
	const portMapPath = path.join(os.tmpdir(), "testportmap.json");
	fs.writeFileSync(portMapPath, JSON.stringify(portMap));
}
