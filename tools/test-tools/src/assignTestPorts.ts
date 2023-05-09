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
	path: string;
}

/**
 * Gets and parses a PackageInfo for packages in the workspace.
 */
export function getPackageInfo(): PackageInfo[] {
	try {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const info: PackageInfo[] = JSON.parse(
			spawnSync("pnpm", ["recursive", "list", "--json", "--depth=-1"], {
				encoding: "utf-8",
			}).stdout,
		);
		if (!Array.isArray(info)) {
			// eslint-disable-next-line unicorn/prefer-type-error
			throw new Error("stdin input was not package array");
		}
		return info;
	} catch (error) {
		console.error(error);
		process.exit(-1);
	}
}

export function writePortMapFile(): void {
	const info: PackageInfo[] = getPackageInfo();

	// Assign a unique port to each package
	const portMap: { [pkgName: string]: number } = {};
	let port = 8081;
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
