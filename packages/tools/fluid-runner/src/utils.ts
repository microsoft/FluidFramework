/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { IFluidFileConverter } from "./codeLoaderBundle";

/**
 * Is the given snapshot in JSON format
 * @param content - snapshot file content
 * @internal
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

/**
 * Validate provided command line arguments
 * @internal
 */
 export function validateCommandLineArgs(
    codeLoader?: string,
    fluidFileConverter?: IFluidFileConverter,
): string | undefined {
    if (codeLoader && fluidFileConverter !== undefined) {
        return "\"codeLoader\" and \"fluidFileConverter\" cannot both be provided. See README for details.";
    }
    if (!codeLoader && fluidFileConverter === undefined) {
        // eslint-disable-next-line max-len
        return "\"codeLoader\" must be provided if there is no explicit \"fluidFileConverter\". See README for details.";
    }
    return undefined;
}
