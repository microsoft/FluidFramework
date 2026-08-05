/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * ESM module resolution hook that pins React imports to a single, explicit React version per test run.
 *
 * @remarks
 * `@fluidframework/react` supports both React 18 and React 19. To exercise the test suite against each,
 * both versions are installed under npm aliases (`react-18` / `react-dom-18` and `react-19` /
 * `react-dom-19`; see the package's devDependencies). Because two `react-dom` copies then exist in the
 * package's dependency closure, `@testing-library/react`'s `react` / `react-dom` peers are ambiguous and
 * pnpm may bind them to a mismatched pair (e.g. `react-dom@19` with `react@18`).
 *
 * To make resolution deterministic regardless of that binding, this hook rewrites every bare `react` /
 * `react-dom` specifier (and their subpaths such as `react/jsx-runtime` or `react-dom/client`) to the
 * aliased package for the version selected by the `REACT_VERSION` environment variable (`18` by default,
 * or `19`). This applies to both the code under test and `@testing-library/react`, so the whole process
 * runs against a single, coherent React install.
 */

const reactVersion = process.env.REACT_VERSION === "19" ? "19" : "18";

/**
 * Map of package name (the part before the first `/`) to the aliased package name to use instead.
 */
const packageAliases = new Map([
	["react", `react-${reactVersion}`],
	["react-dom", `react-dom-${reactVersion}`],
]);

/**
 * Rewrite a bare specifier for `react` / `react-dom` (or one of their subpaths) to the selected aliased
 * package. Returns `undefined` when the specifier is not a React specifier.
 *
 * @param {string} specifier
 * @returns {string | undefined}
 */
function rewriteSpecifier(specifier) {
	// Only bare specifiers are candidates; relative and absolute paths are left untouched.
	const firstSlash = specifier.indexOf("/");
	const packageName = firstSlash === -1 ? specifier : specifier.slice(0, firstSlash);
	const alias = packageAliases.get(packageName);
	if (alias === undefined) {
		return undefined;
	}
	const subpath = firstSlash === -1 ? "" : specifier.slice(firstSlash);
	return `${alias}${subpath}`;
}

/**
 * Node.js ESM `resolve` hook.
 *
 * @param {string} specifier
 * @param {object} context
 * @param {(specifier: string, context: object) => unknown} nextResolve
 */
export function resolve(specifier, context, nextResolve) {
	const rewritten = rewriteSpecifier(specifier);
	if (rewritten !== undefined) {
		return nextResolve(rewritten, context);
	}
	return nextResolve(specifier, context);
}
