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

		// spawnSync reports a failure to even launch the process (e.g. pnpm not on PATH) via `error`.
		if (child.error !== undefined) {
			throw new Error(`Failed to run "pnpm recursive list": ${child.error.message}`);
		}

		// A non-zero exit (or termination by a signal) means pnpm itself failed. Surface its status and
		// stderr instead of blindly parsing the (likely empty) stdout, which would otherwise throw an
		// opaque "Unexpected end of JSON input" that hides the real cause.
		if (child.status !== 0) {
			const reason = child.signal === null ? `code ${child.status}` : `signal ${child.signal}`;
			throw new Error(`"pnpm recursive list" exited with ${reason}.\nstderr:\n${child.stderr}`);
		}

		const stdout = child.stdout?.trim() ?? "";
		if (stdout === "") {
			throw new Error(
				`"pnpm recursive list" produced no output on stdout.\nstderr:\n${child.stderr}`,
			);
		}

		let info: unknown;
		try {
			info = JSON.parse(stdout);
		} catch (parseError) {
			throw new Error(
				`Failed to parse "pnpm recursive list" output as JSON: ${
					(parseError as Error).message
				}\nstdout:\n${stdout}\nstderr:\n${child.stderr}`,
			);
		}

		if (!Array.isArray(info)) {
			// eslint-disable-next-line unicorn/prefer-type-error
			throw new Error(`Expected a package array from "pnpm recursive list", got: ${stdout}`);
		}

		return info as PackageInfo[];
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
