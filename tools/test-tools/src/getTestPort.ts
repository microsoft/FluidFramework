/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Get the port for the pkg from the mapping.  Use a default if the file or the
// entry doesn't exist (e.g. an individual test is being run and the file was
// never generated), which should presumably not lead to collisions
export function getTestPort(pkgName: string): string {
    let mappedPort: string | undefined;
    try {
        const testPortsJson = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "testportmap.json"), "utf-8"));
        mappedPort = testPortsJson[pkgName];
    } catch (e) { }
    if (mappedPort === undefined) {
        mappedPort = "8081";
    }
    return mappedPort;
}
