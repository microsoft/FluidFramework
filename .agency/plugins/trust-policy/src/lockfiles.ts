/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import classicLockfile from "@yarnpkg/lockfile";
import { parseSyml } from "@yarnpkg/parsers";
import npa from "npm-package-arg";
import semver from "semver";
import validatePackageName from "validate-npm-package-name";

export interface PinnedVersion {
	name: string;
	version: string;
}

/**
 * {@link https://github.com/npm/npm-package-arg | npm-package-arg} specifier types that do not resolve through a registry.
 */
const nonRegistrySpecTypes: ReadonlySet<string> = new Set([
	"directory",
	"file",
	"git",
	"remote",
]);

/**
 * Yarn protocols for workspace and local packages, which npm-package-arg does not recognize.
 */
const localYarnProtocols = ["link:", "portal:", "workspace:"] as const;

/**
 * Reads both Yarn Classic and Berry lockfiles without installing the target project.
 * Non-registry protocols are excluded rather than treated as npm package versions.
 *
 * @see {@link https://classic.yarnpkg.com/en/docs/yarn-lock | Yarn Classic lockfile}
 * @see {@link https://yarnpkg.com/protocols | Yarn Berry protocols}
 * @see {@link https://github.com/yarnpkg/berry/blob/master/packages/yarnpkg-core/sources/Project.ts | Yarn Berry lockfile serialization (no formal specification exists)}
 */
export function parseYarnLock(source: string): PinnedVersion[] {
	let lock: unknown;
	if (/^# yarn lockfile v1\s*$/m.test(source)) {
		const parsed = classicLockfile.parse(source);
		if (parsed.type !== "success") {
			throw new Error(`Invalid Yarn Classic lockfile: ${parsed.type}`);
		}
		lock = parsed.object;
	} else {
		lock = parseSyml(source);
	}
	if (!isRecord(lock)) {
		throw new Error("Yarn lockfile must contain a mapping.");
	}
	const result = new Map<string, PinnedVersion>();
	for (const [selector, entry] of Object.entries(lock)) {
		if (selector === "__metadata") {
			continue;
		}
		if (!isRecord(entry)) {
			throw new Error(`Invalid Yarn lock entry: ${selector}`);
		}
		let name: string | undefined;
		if (typeof entry.resolution === "string") {
			// Berry records the real package name, including for aliases, in the resolved locator.
			const [ident, reference] = splitYarnDescriptor(entry.resolution);
			name = reference.startsWith("npm:") ? ident : registryPackage(ident, reference)?.name;
		} else {
			// @yarnpkg/lockfile already splits Classic's grouped selectors into one key per descriptor.
			name = registryPackage(...splitYarnDescriptor(selector))?.name;
			if (
				name !== undefined &&
				(typeof entry.resolved !== "string" || !/^https?:\/\//.test(entry.resolved))
			) {
				throw new Error(`Missing registry tarball for Yarn entry: ${selector}`);
			}
		}
		if (name !== undefined) {
			addPinned(result, name, entry.version);
		}
	}
	return [...result.values()];
}

/**
 * Splits a Yarn descriptor or locator, such as `@scope/name@npm:^1`, into its package name and range or reference.
 */
function splitYarnDescriptor(descriptor: string): [name: string, range: string] {
	// A scoped name starts with "@", so the separator is the first "@" after the first character.
	const separator = descriptor.indexOf("@", 1);
	if (separator === -1) {
		throw new Error(`Invalid Yarn descriptor: ${descriptor}`);
	}
	return [descriptor.slice(0, separator), descriptor.slice(separator + 1)];
}

/**
 * Resolves a dependency specifier to the registry package it installs, following npm aliases.
 * @param name - Dependency name.
 * @param spec - Version, range, tag, alias, or protocol specifier.
 * @returns The registry package name and specifier, or `undefined` for workspace, local, Git, and tarball dependencies.
 */
function registryPackage(
	name: string,
	spec: string,
): { name: string; spec: string } | undefined {
	if (spec.startsWith("patch:")) {
		throw new Error(
			`Patched packages are not supported; refusing an incomplete audit: ${name}@${spec}`,
		);
	}
	if (localYarnProtocols.some((protocol) => spec.startsWith(protocol))) {
		return undefined;
	}
	const parsed = npa.resolve(name, spec);
	if (parsed.type === "alias") {
		const target = parsed.subSpec;
		if (!target?.name) {
			throw new Error(`Invalid npm alias: ${name}@${spec}`);
		}
		return { name: target.name, spec: target.rawSpec };
	}
	return nonRegistrySpecTypes.has(parsed.type) ? undefined : { name, spec };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads npm package-lock/shrinkwrap versions 1–3, including nested and aliased pins.
 * Version 2's compatibility dependency tree is ignored in favor of its packages map.
 *
 * @see {@link https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json | package-lock.json}
 * @see {@link https://docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json | npm-shrinkwrap.json}
 */
export function parseNpmLock(source: string): PinnedVersion[] {
	const lock: unknown = JSON.parse(source);
	if (!isRecord(lock) || ![1, 2, 3].includes(Number(lock.lockfileVersion))) {
		throw new Error("Expected an npm lockfile with lockfileVersion 1, 2, or 3.");
	}
	const result = new Map<string, PinnedVersion>();
	function visit(name: string, entry: unknown): void {
		if (!isRecord(entry)) {
			throw new Error(`Invalid npm dependency entry: ${name}`);
		}
		if (entry.link === true) {
			return;
		}
		if (
			typeof entry.resolved === "string" &&
			["directory", "file", "git"].includes(npa.resolve(name, entry.resolved).type)
		) {
			return;
		}
		if (entry.version === undefined) {
			throw new Error(`Missing npm version: ${name}`);
		}
		if (typeof entry.version !== "string") {
			throw new Error(`Invalid npm version: ${name}`);
		}
		// Version 2+ records an alias's real name in `name`; version 1 records the alias in `version`.
		const pin = registryPackage(
			typeof entry.name === "string" ? entry.name : name,
			entry.version,
		);
		if (pin !== undefined) {
			addPinned(result, pin.name, pin.spec);
		}
	}
	if (lock.lockfileVersion === 1) {
		function walk(dependencies: unknown): void {
			if (!isRecord(dependencies)) {
				throw new Error("Invalid npm dependencies map.");
			}
			for (const [name, entry] of Object.entries(dependencies)) {
				visit(name, entry);
				if (isRecord(entry) && entry.dependencies !== undefined) {
					walk(entry.dependencies);
				}
			}
		}
		walk(lock.dependencies ?? {});
	} else {
		if (!isRecord(lock.packages)) {
			throw new Error("Missing npm packages map.");
		}
		const installDir = "node_modules/";
		for (const [location, entry] of Object.entries(lock.packages)) {
			// Root and workspace package definitions are not installed under node_modules.
			const index = location.lastIndexOf(installDir);
			if (index !== -1) {
				visit(location.slice(index + installDir.length), entry);
			}
		}
	}
	return [...result.values()];
}

/**
 * Records a registry package version, keyed by `name@version` so duplicates collapse.
 * @param result - Pins collected so far.
 * @param name - Package name.
 * @param version - Exact version.
 */
export function addPinned(
	result: Map<string, PinnedVersion>,
	name: string,
	version: unknown,
): void {
	const pin = toPinnedVersion(name, version);
	result.set(`${pin.name}@${pin.version}`, pin);
}

/**
 * Validates a registry package name and exact, canonical semantic version.
 * @param name - Package name.
 * @param version - Exact version.
 */
export function toPinnedVersion(name: string, version: unknown): PinnedVersion {
	const parsed = typeof version === "string" ? semver.parse(version) : null;
	// semver accepts a leading "v" or "=", which registries never record in a version.
	const canonical =
		parsed === null || parsed.build.length === 0
			? parsed?.version
			: `${parsed.version}+${parsed.build.join(".")}`;
	if (
		canonical === undefined ||
		canonical !== version ||
		!validatePackageName(name).validForOldPackages
	) {
		throw new Error(`Invalid registry package pin: ${name}@${String(version)}`);
	}
	return { name, version: canonical };
}
