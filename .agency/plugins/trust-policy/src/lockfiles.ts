/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parseSyml } from "@yarnpkg/parsers";
import classicLockfile from "@yarnpkg/lockfile";
import semver from "semver";

export interface PinnedVersion {
	name: string;
	version: string;
}

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
		const resolution = entry.resolution;
		let name: string;
		if (typeof resolution === "string") {
			// Berry records the real npm name, including aliases, in the locator.
			const match = /^(@?[^@]+)@npm:(.+)$/.exec(resolution);
			if (match === null) {
				if (/@(?:workspace|file|link|portal|patch|https?|git|github):/.test(resolution)) {
					throwIfPatchedRegistry(resolution);
					continue;
				}
				throw new Error(`Unsupported Yarn resolution: ${resolution}`);
			}
			name = match[1] ?? "";
		} else {
			// Classic can group several quoted descriptors in a single key.
			const descriptor = selector.split(/,\s*/)[0]?.replace(/^"|"$/g, "") ?? "";
			const match = /^(@?[^@]+)@(.+)$/.exec(descriptor);
			if (match === null) {
				throw new Error(`Invalid Yarn descriptor: ${selector}`);
			}
			name = match[1] ?? "";
			const range = match[2] ?? "";
			if (/^(?:file|link|workspace|portal|patch|https?|git|github|git\+[^:]+):/.test(range)) {
				throwIfPatchedRegistry(range);
				continue;
			}
			if (range.startsWith("npm:")) {
				const alias = /^npm:(@?[^@]+)@/.exec(range);
				if (alias === null) {
					throw new Error(`Invalid npm alias: ${selector}`);
				}
				name = alias[1] ?? "";
			}
			if (typeof entry.resolved !== "string" || !/^https?:\/\//.test(entry.resolved)) {
				throw new Error(`Missing registry tarball for Yarn entry: ${selector}`);
			}
		}
		addPinned(result, name, entry.version);
	}
	return [...result.values()];
}

function throwIfPatchedRegistry(resolution: string): void {
	if (resolution.includes("patch:")) {
		throw new Error(
			`Patched Yarn packages are not supported; refusing an incomplete audit: ${resolution}`,
		);
	}
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
		const version = entry.version;
		const nonRegistryResolution =
			typeof entry.resolved === "string" &&
			/^(?:file|link|workspace|git|github|git\+[^:]+):/.test(entry.resolved);
		if (entry.link !== true && !nonRegistryResolution && version !== undefined) {
			if (typeof version !== "string") {
				throw new Error(`Invalid npm version: ${name}`);
			}
			if (!/^(?:file|link|workspace|https?|git|github|git\+[^:]+):/.test(version)) {
				if (version.startsWith("npm:")) {
					const alias = /^npm:(@?[^@]+)@(.+)$/.exec(version);
					if (alias === null) {
						throw new Error(`Invalid npm alias: ${version}`);
					}
					addPinned(result, alias[1] ?? "", alias[2]);
				} else {
					addPinned(result, typeof entry.name === "string" ? entry.name : name, version);
				}
			}
		} else if (entry.link !== true && !nonRegistryResolution) {
			throw new Error(`Missing npm version: ${name}`);
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
		for (const [location, entry] of Object.entries(lock.packages)) {
			// Root and workspace package definitions are not registry dependencies.
			const match = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(location);
			if (match !== null) {
				visit(match[1] ?? "", entry);
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
	if (
		!/^(@[a-z0-9_.~-]+\/)?[a-z0-9_.~-]+$/i.test(name) ||
		typeof version !== "string" ||
		!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version) ||
		semver.valid(version) === null
	) {
		throw new Error(`Invalid registry package pin: ${name}@${String(version)}`);
	}
	return { name, version };
}
