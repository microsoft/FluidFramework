/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Get the port for the pkg from the mapping.  Use a default if the file or the
// entry doesn't exist (e.g. an individual test is being run and the file was
// never generated), which should presumably not lead to collisions
export function getTestPort(pkgName: string): string {
    let mappedPort: string | undefined;
    try {
        const testPortsJson = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "testportmap.json")));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        mappedPort = testPortsJson[pkgName];
    // eslint-disable-next-line no-empty
    } catch { }
    if (mappedPort === undefined) {
        mappedPort = "8081";
    }
    return mappedPort;
}
