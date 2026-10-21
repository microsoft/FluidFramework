/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import semver from "semver";

/**
 * Returns the configured selector that exempts `name@version`, if any.
 */
export type TrustPolicyExclude = (name: string, version: string) => string | undefined;

interface ExclusionRule {
	selector: string;
	matchesName: (name: string) => boolean;
	exactVersions: string[];
}

/**
 * Evaluates `trustPolicyExclude` selectors with pnpm 11's semantics.
 * A bare name or name glob covers every version, and exact versions from every rule matching a name are combined.
 * @param selectors - Values of pnpm's `trustPolicyExclude` setting.
 */
export function createTrustPolicyExclude(selectors: readonly string[]): TrustPolicyExclude {
	const rules = selectors.map((selector): ExclusionRule => {
		const { packageName, exactVersions } = parseSelector(selector);
		return { selector, matchesName: createNameMatcher(packageName), exactVersions };
	});
	return (name, version) =>
		rules.find(
			({ matchesName, exactVersions }) =>
				matchesName(name) && (exactVersions.length === 0 || exactVersions.includes(version)),
		)?.selector;
}

function parseSelector(selector: string): { packageName: string; exactVersions: string[] } {
	const atIndex = selector.startsWith("@") ? selector.indexOf("@", 1) : selector.indexOf("@");
	if (atIndex === -1) {
		return { packageName: selector, exactVersions: [] };
	}
	const packageName = selector.slice(0, atIndex);
	const exactVersions: string[] = [];
	for (const raw of selector.slice(atIndex + 1).split("||")) {
		const version = semver.valid(raw);
		if (version === null) {
			throw new Error(
				`Invalid value in trustPolicyExclude: "${selector}". Use exact versions only.`,
			);
		}
		exactVersions.push(version);
	}
	if (packageName.includes("*")) {
		throw new Error(
			`Invalid value in trustPolicyExclude: "${selector}". Name patterns are not allowed with versions.`,
		);
	}
	return { packageName, exactVersions };
}

function createNameMatcher(pattern: string): (name: string) => boolean {
	// pnpm treats a leading "!" in a single-pattern matcher as negation.
	if (pattern.startsWith("!")) {
		const matches = createNameMatcher(pattern.slice(1));
		return (name) => !matches(name);
	}
	if (pattern === "*") {
		return () => true;
	}
	const source = pattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*")
		.replace(/\?/g, ".");
	const regexp = new RegExp(`^${source}$`, "su");
	return (name) => regexp.test(name);
}

/**
 * Normalizes `pnpm config get trustPolicyExclude --json` output.
 * pnpm prints nothing when the setting is absent and a lone string when it is a YAML scalar.
 * @param stdout - Output of pnpm config get.
 */
export function parseTrustPolicyExcludeConfig(stdout: string): string[] {
	const text = stdout.trim();
	if (text === "" || text === "undefined") {
		return [];
	}
	const value: unknown = JSON.parse(text);
	if (value === null) {
		return [];
	}
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
		return value;
	}
	throw new Error(`Unexpected trustPolicyExclude configuration: ${text}`);
}
