/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Module, { createRequire, register } from "node:module";

register("./hooks.mjs", import.meta.url);

const reactVersion = process.env.REACT_VERSION === "19" ? "19" : "18";
const requireFromHere = createRequire(import.meta.url);
const react19PackageJson = requireFromHere.resolve(
	"@fluid-internal/react-19-test-dependencies/package.json",
);
const requireFromReact19Dependencies = createRequire(react19PackageJson);
const originalResolveFilename = Module._resolveFilename;
let resolvingFromReact19Dependencies = false;

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

Module._resolveFilename = function (request, ...rest) {
	if (resolvingFromReact19Dependencies) {
		return originalResolveFilename.call(this, request, ...rest);
	}
	if (reactVersion === "19" && aliasFor(request) !== undefined) {
		resolvingFromReact19Dependencies = true;
		try {
			return requireFromReact19Dependencies.resolve(request);
		} finally {
			resolvingFromReact19Dependencies = false;
		}
	}
	const alias = aliasFor(request);
	if (alias !== undefined) {
		return requireFromHere.resolve(alias);
	}
	return originalResolveFilename.call(this, request, ...rest);
};
