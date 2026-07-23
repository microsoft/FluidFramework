/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Entry point used via `node --import` (see ../../../.mocharc.cjs) to pin React imports to a single,
// explicit React version for the test run.
//
// Two mechanisms are needed because the packages involved use different module systems:
//  - `@fluidframework/react`'s own code and the test files are ESM, so their `import "react"` /
//    `import "react-dom"` go through the ESM `resolve` hook in ./hooks.mjs.
//  - `@testing-library/react` (and react-dom itself) are CommonJS and use `require(...)`, which the ESM
//    `resolve` hook does NOT intercept. Those are handled by patching `Module._resolveFilename` below.
//
// Both mechanisms redirect `react` / `react-dom` (and their subpaths) to the aliased package for the
// version selected by REACT_VERSION, and both resolve the alias from this package's node_modules so the
// ESM and CommonJS paths land on the exact same file (and therefore share a single React instance).
// See ./hooks.mjs for details of the version selection.

import Module, { createRequire, register } from "node:module";

// Register the ESM resolve hook (handles `import` from ESM modules).
register("./hooks.mjs", import.meta.url);

const reactVersion = process.env.REACT_VERSION === "19" ? "19" : "18";

// Resolve aliases relative to this file, which lives inside the package whose node_modules contains the
// `react-18` / `react-19` / `react-dom-18` / `react-dom-19` aliases.
const requireFromHere = createRequire(import.meta.url);

/**
 * Rewrite a bare `react` / `react-dom` specifier (or one of its subpaths) to the selected aliased
 * package name. Returns `undefined` for non-React specifiers.
 *
 * @param {string} specifier
 * @returns {string | undefined}
 */
function aliasFor(specifier) {
	const firstSlash = specifier.indexOf("/");
	const packageName = firstSlash === -1 ? specifier : specifier.slice(0, firstSlash);
	const subpath = firstSlash === -1 ? "" : specifier.slice(firstSlash);
	if (packageName === "react") {
		return `react-${reactVersion}${subpath}`;
	}
	if (packageName === "react-dom") {
		return `react-dom-${reactVersion}${subpath}`;
	}
	return undefined;
}

// Patch CommonJS resolution so that `require("react")` / `require("react-dom")` (e.g. from
// @testing-library/react, and from react-dom's own internal `require("react")`) resolve to the aliased
// package. The alias is resolved to an absolute path from this package's node_modules, because the
// requiring CommonJS module (e.g. testing-library) cannot see the aliases from its own location.
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	const alias = aliasFor(request);
	if (alias !== undefined) {
		try {
			return requireFromHere.resolve(alias);
		} catch {
			// Fall through to the default resolution if the alias can't be resolved.
		}
	}
	return originalResolveFilename.call(this, request, ...rest);
};
