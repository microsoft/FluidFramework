/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Get the port for the pkg from the mapping.  Use a default if the file or the entry doesn't exist
 * (e.g. an individual test is being run and the file was never generated), which should presumably
 * not lead to collisions.
 */
export function getTestPort(pkgName: string): number {
	let mappedPort: number | undefined;

	try {
		const portMapPath: string = fs
			.readFileSync(path.join(os.tmpdir(), "testportmap.json"))
			.toString();
		const testPortsJson = JSON.parse(portMapPath) as Record<string, number | undefined>;
		mappedPort = testPortsJson[pkgName];
	} catch {
		// Fall through to the default below.
	}

	if (mappedPort === undefined) {
		console.warn(
			"Port mapping not available, using default port of 8081. If you encounter port collisions, be sure to run assign-test-ports.",
		);
		mappedPort = 8081;
	}

	return mappedPort;
}
