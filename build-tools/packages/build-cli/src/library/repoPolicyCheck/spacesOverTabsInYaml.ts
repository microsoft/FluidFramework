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

		// /m is multiline mode, so ^ matches the start of any line, not just the start of the full string
		if (content.search(/^\t/m) !== -1) {
			return `Tab indentation detected in YAML file. Please use spaces for indentation.`;
		}
	},
};
