/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Custom loader hook that handles CSS file imports by returning an empty module.
 * This allows tests to run in Node.js where CSS imports would otherwise fail.
 */

/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/explicit-module-boundary-types */

export async function load(url, context, nextLoad) {
	if (url.endsWith(".css")) {
		return {
			format: "module",
			shortCircuit: true,
			source: "export default {};",
		};
	}

	return nextLoad(url, context);
}
