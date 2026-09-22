/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const reactVersion = process.env.REACT_VERSION === "19" ? "19" : "18";
const packageAliases = new Map([
	["react", `react-${reactVersion}`],
	["react-dom", `react-dom-${reactVersion}`],
]);

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
	return nextResolve(rewriteSpecifier(specifier) ?? specifier, context);
}
