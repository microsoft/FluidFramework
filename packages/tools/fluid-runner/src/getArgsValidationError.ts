/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

export function getArgsValidationError(
    inputFile: string,
    outputFolder: string,
    scenario: string,
): string | undefined {
    // Validate input file
    if (!inputFile) {
        // TODO: Do not log file name. It can be customer content
        return "Input file name is missing.";
    } else if (!fs.existsSync(inputFile)) {
        return "Input file does not exist.";
    }

    // Validate output file
    if (!outputFolder) {
        return "Output folder name is missing.";
    } else if (!fs.existsSync(outputFolder)) {
        return "Output folder does not exist.";
    }

    // Validate scenario name
    if (!scenario) {
        return "Scenario name is missing.";
    }

    return undefined;
}
