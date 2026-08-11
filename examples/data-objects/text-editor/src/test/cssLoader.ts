/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Module } from "node:module";

type ResolveHook = Module.ResolveHook;

/**
 * Custom ESM loader hook to handle CSS imports in the Node.js test environment.
 * CSS files are not valid JavaScript modules, so we intercept them and return an empty module.
 */
export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
	if (specifier.endsWith(".css")) {
		return {
			shortCircuit: true,
			url: "data:text/javascript,",
		};
	}
	return nextResolve(specifier, context);
};
