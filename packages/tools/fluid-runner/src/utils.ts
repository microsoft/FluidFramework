/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

/**
 * Is the given snapshot in JSON format
 * @param content - snapshot file content
 */
export function isJsonSnapshot(content: Buffer): boolean {
    return content.toString(undefined, 0, 1) === "{";
}

/**
 * Get the ODSP snapshot file content
 * Works on both JSON and binary snapshot formats
 * @param filePath - path to the ODSP snapshot file
 */
export function getSnapshotFileContent(filePath: string): string | Buffer {
    // TODO: read file stream
    const content = fs.readFileSync(filePath);
    return isJsonSnapshot(content) ? content.toString() : content;
}
