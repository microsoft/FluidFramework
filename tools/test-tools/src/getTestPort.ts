/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Get the port for the pkg from the mapping.  Use `fallbackPort` if the file or the entry doesn't exist
 * (e.g. an individual test is being run and the file was never generated), which should presumably
 * not lead to collisions.
 * @param packageName - The name of the package to look up the assigned port for.
 * @param fallbackPort - The port to return when no assigned port is found (no mapping file, or no entry for
 * the package). Defaults to 8081.
 */
export function getTestPort(packageName: string, fallbackPort: number = 8081): number {
	let mappedPort: number | undefined;

	try {
		const portMapPath: string = fs
			.readFileSync(path.join(os.tmpdir(), "testportmap.json"))
			.toString();
		const testPortsJson = JSON.parse(portMapPath) as Record<string, number | undefined>;
		mappedPort = testPortsJson[packageName];
	} catch {
		// Fall through to the fallback below.
	}

	if (mappedPort === undefined) {
		console.warn(
			`Port mapping not available, using fallback port of ${fallbackPort}. If you encounter port collisions, be sure to run assign-test-ports.`,
		);
		mappedPort = fallbackPort;
	}

	return mappedPort;
}
