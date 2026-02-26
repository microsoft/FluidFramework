/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import os from "os";
import path from "path";

const portMapPath = path.join(os.tmpdir(), "testportmap.json");

/**
 * Get the port for the pkg from the mapping.  Use a default if the file or the entry doesn't exist
 * (e.g. an individual test is being run and the file was never generated), which should presumably
 * not lead to collisions.
 */
export function getTestPort(pkgName: string): string {
	if (!fs.existsSync(portMapPath)) {
		return "8081";
	}

	try {
		const portMapContent: string = fs.readFileSync(portMapPath).toString();
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const testPortsJson = JSON.parse(portMapContent);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const mappedPort: string | undefined = testPortsJson[pkgName];
		return mappedPort ?? "8081";
	} catch {
		console.warn(
			"Port mapping file exists but could not be read. Using default port 8081.",
		);
		return "8081";
	}
}
