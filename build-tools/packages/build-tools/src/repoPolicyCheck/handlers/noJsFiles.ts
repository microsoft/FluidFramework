/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Handler } from "../common";

/**
 * A policy handler that checks for JavaScript source files that just use the .js file extension. Such files may be
 * interpreted by node as either CommonJS or ESM based on the `type` field in the nearest package.json file. However
 * this is not determinstic. Using file extensions reduces ambiguity and makes the behavior deterministic.
 */
export const handler: Handler = {
	name: "no-js-file-extensions",
	match: /(^|\/)[^/]+\.js$/i,
	handler: async (file) => {
		// Any match is considered a failure.
		return `${file}: JavaScript files should have a .cjs or .mjs file extension based on the module format of the file. Rename the file accordingly.`;
	},
};
