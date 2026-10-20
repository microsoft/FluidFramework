/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parseSyml } from "@yarnpkg/parsers";
import classicLockfile from "@yarnpkg/lockfile";

export interface PinnedVersion {
	name: string;
	version: string;
}

/**
 * Reads both Yarn Classic and Berry lockfiles without installing the target project.
 * Non-registry protocols are excluded rather than treated as npm package versions.
 */
export function parseYarnLock(source: string): PinnedVersion[] {
	let lock: unknown;
	if (/^# yarn lockfile v1\s*$/m.test(source)) {
		const parsed = classicLockfile.parse(source);
		if (parsed.type !== "success")
			throw new Error(`Invalid Yarn Classic lockfile: ${parsed.type}`);
		lock = parsed.object;
	} else {
		lock = parseSyml(source);
	}
	if (!isRecord(lock)) throw new Error("Yarn lockfile must contain a mapping.");
	const result = new Map<string, PinnedVersion>();
	for (const [selector, entry] of Object.entries(lock)) {
		if (selector === "__metadata") continue;
		if (!isRecord(entry)) throw new Error(`Invalid Yarn lock entry: ${selector}`);
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
			if (match === null) throw new Error(`Invalid Yarn descriptor: ${selector}`);
			name = match[1] ?? "";
			const range = match[2] ?? "";
			if (/^(?:file|link|workspace|portal|patch|https?|git|github|git\+[^:]+):/.test(range)) {
				throwIfPatchedRegistry(range);
				continue;
			}
			if (range.startsWith("npm:")) {
				const alias = /^npm:(@?[^@]+)@/.exec(range);
				if (alias === null) throw new Error(`Invalid npm alias: ${selector}`);
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

export function addPinned(
	result: Map<string, PinnedVersion>,
	name: string,
	version: unknown,
): void {
	if (
		!/^(@[a-z0-9_.~-]+\/)?[a-z0-9_.~-]+$/i.test(name) ||
		typeof version !== "string" ||
		!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
	) {
		throw new Error(`Invalid registry package pin: ${name}@${String(version)}`);
	}
	result.set(`${name}@${version}`, { name, version });
}
