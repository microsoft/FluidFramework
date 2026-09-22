/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const reactVersion = process.env.REACT_VERSION === "19" ? "19" : "18";
const packageAliases = new Map([
	["react", `react-${reactVersion}`],
	["react-dom", `react-dom-${reactVersion}`],
]);
const requireFromHere = createRequire(import.meta.url);
const react19PackageJson = requireFromHere.resolve(
	"@fluid-internal/react-19-test-dependencies/package.json",
);
const requireFromReact19Dependencies = createRequire(react19PackageJson);

function rewriteSpecifier(specifier) {
	const firstSlash = specifier.indexOf("/");
	const packageName = firstSlash === -1 ? specifier : specifier.slice(0, firstSlash);
	const alias = packageAliases.get(packageName);
	if (alias === undefined) {
		return undefined;
	}
	const subpath = firstSlash === -1 ? "" : specifier.slice(firstSlash);
	return `${alias}${subpath}`;
}

export function resolve(specifier, context, nextResolve) {
	if (reactVersion === "19") {
		const firstSlash = specifier.indexOf("/");
		const packageName = firstSlash === -1 ? specifier : specifier.slice(0, firstSlash);
		if (packageName === "react" || packageName === "react-dom") {
			return nextResolve(
				pathToFileURL(requireFromReact19Dependencies.resolve(specifier)).href,
				context,
			);
		}
	}
	return nextResolve(rewriteSpecifier(specifier) ?? specifier, context);
}
