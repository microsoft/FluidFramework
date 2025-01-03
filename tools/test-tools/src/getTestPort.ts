/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import os from "os";
import path from "path";

const defaultPort = 8081;

/**
 * Get the port for the pkg from the mapping.  Use a default if the file or the entry doesn't exist
 * (e.g. an individual test is being run and the file was never generated), which should presumably
 * not lead to collisions.
 */
export function getTestPort(pkgName: string): number {
	let mappedPort: number;

	const commonErrorString = `Using default port ${defaultPort}. If you encounter port collisions, be sure to run assign-test-ports.`;

	try {
		const portMapRaw: string = fs
			.readFileSync(path.join(os.tmpdir(), "testportmap.json"))
			.toString();
		const testPortsJson = JSON.parse(portMapRaw) as Record<string, string>;
		const portForPackage: string | undefined = testPortsJson[pkgName];
		if (portForPackage === undefined) {
			mappedPort = defaultPort;
		} else if (Number.isFinite(portForPackage)) {
			mappedPort = Number.parseInt(portForPackage, 10);
		} else {
			console.warn(`Found invalid port '${portForPackage}' for package '${pkgName}' in port map. ${commonErrorString}`);
			mappedPort = defaultPort;
		}
	} catch {
		console.warn(
			`Port mapping not available. ${commonErrorString}`,
		);
		mappedPort = defaultPort;
	}
	return mappedPort;
}
