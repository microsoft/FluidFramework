/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createPackageVersionPolicyOrThrow } from "@pnpm/config.version-policy";

/**
 * Returns the configured selector that exempts `name@version`, if any.
 */
export type TrustPolicyExclude = (name: string, version: string) => string | undefined;

/**
 * Evaluates `trustPolicyExclude` selectors with pnpm's own parser and matcher.
 * Each selector is evaluated separately so the one that exempts a version can be reported.
 * @param selectors - Values of pnpm's `trustPolicyExclude` setting.
 */
export function createTrustPolicyExclude(selectors: readonly string[]): TrustPolicyExclude {
	const rules = selectors.map((selector) => ({
		selector,
		policy: createPackageVersionPolicyOrThrow(selector, "trustPolicyExclude"),
	}));
	return (name, version) =>
		rules.find(({ policy }) => {
			const versions = policy(name);
			return versions === true || (Array.isArray(versions) && versions.includes(version));
		})?.selector;
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
