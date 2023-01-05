/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

export function getArgsValidationError(
    inputFile: string,
    outputFile: string,
): string | undefined {
    // Validate input file
    if (!inputFile) {
        return "Input file name argument is missing.";
    } else if (!fs.existsSync(inputFile)) {
        return "Input file does not exist.";
    }

    // Validate output file
    if (!outputFile) {
        return "Output file argument is missing.";
    } else if (fs.existsSync(outputFile)) {
        return `Output file already exists [${outputFile}].`;
    }

    return undefined;
}
