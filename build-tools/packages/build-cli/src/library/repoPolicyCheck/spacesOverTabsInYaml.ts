/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Handler, readFile } from "./common.js";

/**
 * Checks that *.yml/*.yaml files do not use tabs for indentation.
 * Deliberately does not provide a resolver because automatic changes to yaml files, in particular those related to
 * indentation, can be risky.
 */
export const handler: Handler = {
	name: "indent-with-spaces-in-yaml",
	match: /(^|\/)[^/]+\.ya?ml$/i,
	handler: async (file: string): Promise<string | undefined> => {
		const content = readFile(file);
		return lookForTabs(content);
	},
};

/**
 * Checks for tabs in the indentation of the specified file contents.
 * @remarks Exported only for testing purposes
 * @param fileContents - the file contents to check.
 * @returns an error message if tabs are found; otherwise undefined.
 */
export function lookForTabs(fileContents: string): string | undefined {
	// /m is multiline mode, so ^ matches the start of any line, not just the start of the full string
	// Fail on tabs right at the start of the line, or after whitespace but before any non-whitespace character.
	if (fileContents.search(/^\s*\t/m) !== -1) {
		return errorMessage;
	}
}

/**
 * Exported only for testing purposes.
 */
export const errorMessage = `Tab indentation detected in YAML file. Please use spaces for indentation.`;
