/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface PackageInfo {
	name: string;
	version: string;
	private: string;
	// If useful, both lerna and pnpm report the path to the package.
	// Pnpm uses the key "path", while lerna uses "location"
}

/**
 * Gets and parses a PackageInfo for packages in the workspace.
 */
export function getPackageInfo(packageManager: 'pnpm' | 'lerna'): PackageInfo[] {
	try {
		const command = packageManager;
		const args = packageManager === 'pnpm' ? ["recursive", "list", "--json", "--depth=-1"] : ["list", "--json", "--all"];
		const child = spawnSync(command, args, {
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

export function writePortMapFile(initialPort: number, packageManager: 'pnpm' | 'lerna'): void {
	const info: PackageInfo[] = getPackageInfo(packageManager);

	// Assign a unique port to each package
	const portMap: { [pkgName: string]: number } = {};
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
