/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

/**
 * Is the given snapshot in JSON format
 * @param path - path to snapshot file
 */
export function isJsonSnapshot(path: string): boolean {
    const buffer = Buffer.alloc(1);
    const fd = fs.openSync(path, "r");
    fs.readSync(fd, buffer, 0, 1, 0);
    fs.closeSync(fd);

    return buffer.toString() === "{";
}

/**
 * Get the ODSP snapshot file content
 * Works on both JSON and binary snapshot formats
 * @param filePath - path to the ODSP snapshot file
 */
export function getSnapshotFileContent(filePath: string): string | Uint8Array {
    if (isJsonSnapshot(filePath)) {
        return fs.readFileSync(filePath, { encoding: "utf-8" });
    } else {
        return fs.readFileSync(filePath);
    }
}
