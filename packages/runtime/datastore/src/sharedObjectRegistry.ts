/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type {
	ISharedObjectRegistry,
	ISharedObjectRegistryInternal,
} from "./dataStoreRuntime.js";

/**
 * The common URL prefix used by legacy DDS type strings.
 * Factories originally used full URLs (e.g. `"https://graph.microsoft.com/types/map"`);
 * new factories use only the trailing path segment (e.g. `"map"`).
 *
 * Support for reading both formats was added in 2.92.0.
 * @remarks
 * This is encoded using base64 to avoid replacement of URL-like values that we have seen some reverse proxies perform.
 * The value at runtime is "https://graph.microsoft.com/types/".
 */
const legacyTypeUrlPrefix = atob("aHR0cHM6Ly9ncmFwaC5taWNyb3NvZnQuY29tL3R5cGVzLw==");

/**
 * Wraps an {@link ISharedObjectRegistry} to transparently redirect legacy URL-based DDS type
 * strings to the factories registered under the corresponding short-name path segment.
 *
 * When a lookup by the full URL fails, this wrapper retries using only the portion of the URL
 * after `"https://graph.microsoft.com/types/"`. This allows old documents whose summaries
 * contain URL-based type strings to be loaded against a registry built with the current
 * short-name factory types.
 *
 * @remarks
 * Support for reading both full URL and short-name type identifiers was added in 2.92.0.
 * @privateRemarks
 * See {@link legacyTypeUrlPrefix} for details on the historical type prefix.
 * @internal
 */
export class LegacyTypeAwareRegistry implements ISharedObjectRegistry {
	public constructor(private readonly base: ISharedObjectRegistry) {}

	public async getAsync(name: string): Promise<IChannelFactory | undefined> {
		const registry: ISharedObjectRegistryInternal = this.base;
		if (registry.getAsync === undefined) {
			return this.get(name);
		}
		for (const candidate of legacySharedObjectTypeAliases(name)) {
			const factory = await registry.getAsync(candidate);
			if (factory !== undefined) {
				return factory;
			}
		}
		return undefined;
	}

	public get(name: string): IChannelFactory | undefined {
		for (const candidate of legacySharedObjectTypeAliases(name)) {
			const factory = this.base.get(candidate);
			if (factory !== undefined) {
				return factory;
			}
		}
		return undefined;
	}
}

/**
 * Factory lookup candidates for current and historical DDS type identifiers.
 * @internal
 */
export function legacySharedObjectTypeAliases(name: string): string[] {
	// Prefer an exact match before trying compatibility aliases.
	// Removing the prefix lets current factories load old documents.
	// Adding it lets code with legacy factory identifiers read documents written with short names.
	// Only the latter is temporary: it can be removed when collaboration with that code is no longer supported.
	const candidates = [
		name,
		name.startsWith(legacyTypeUrlPrefix)
			? name.slice(legacyTypeUrlPrefix.length)
			: `${legacyTypeUrlPrefix}${name}`,
	];
	if (isURL(name) && name.includes("graph.microsoft")) {
		// A reverse proxy may have rewritten the legacy URL's base.
		// This is a heuristic: assume its final segment still identifies the DDS, and try both formats.
		const finalSegment = name.split("/").at(-1);
		if (finalSegment !== undefined) {
			candidates.push(finalSegment, `${legacyTypeUrlPrefix}${finalSegment}`);
		}
	}
	return candidates;
}

function isURL(str: string): boolean {
	try {
		new URL(str);
		return true;
	} catch {
		return false;
	}
}
