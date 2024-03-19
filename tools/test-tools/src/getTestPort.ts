/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */


import fs from "fs";
import os from "os";
import path from "path";

/**
 * Get the port for the pkg from the mapping.  Use a default if the file or the entry doesn't exist
 * (e.g. an individual test is being run and the file was never generated), which should presumably
 * not lead to collisions.
 */
export function getTestPort(pkgName: string): string {
	let mappedPort: string;

	try {
		const portMapPath: string = fs
			.readFileSync(path.join(os.tmpdir(), "testportmap.json"))
			.toString();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const testPortsJson = JSON.parse(portMapPath);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		mappedPort = testPortsJson[pkgName];
	} catch {
		console.warn(
			"Port mapping not available, using default port of 8081. If you encounter port collisions, be sure to run assign-test-ports.",
		);
		mappedPort = "8081";
	}
	return mappedPort;
}
